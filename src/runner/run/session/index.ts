/* src/stan/run/session/index.ts
 * One-shot run session (single attempt).
 * Orchestrates: plan print, UI wiring, cancellation/restart, scripts, archives.
 */
import { resolve as resolvePath } from 'node:path';

import { yieldToEventLoop } from '@/runner/run/exec/util';
import { liveTrace, ProcessSupervisor } from '@/runner/run/live';
// SSR/CJS-robust resolver: prefer named export; fall back to default.register
import * as archiveStageMod from '@/runner/run/session/archive-stage';
import { ensureOrderFile } from '@/runner/run/session/order-file';
import {
  printPlanWithPrompt,
  resolvePromptOrThrow,
} from '@/runner/run/session/prompt-plan';
import { attachSessionSignals } from '@/runner/run/session/signals';
import { queueUiRows } from '@/runner/run/session/ui-queue';
import type { RunnerConfig } from '@/runner/run/types';
import type { ExecutionMode, RunBehavior } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

import { CancelController } from './cancel-controller';
import { runScriptsPhase } from './scripts-phase';
import type { SessionOutcome } from './types';

// Resolve runArchiveStage from named or default export for SSR robustness.
const resolveRunArchiveStage = ():
  | (typeof import('@/runner/run/session/archive-stage'))['runArchiveStage']
  | undefined => {
  const mod = archiveStageMod as unknown as {
    runArchiveStage?: unknown;
    default?: { runArchiveStage?: unknown };
  };
  const fn =
    typeof mod.runArchiveStage === 'function'
      ? mod.runArchiveStage
      : typeof mod.default?.runArchiveStage === 'function'
        ? mod.default.runArchiveStage
        : undefined;
  return fn as
    | (typeof import('@/runner/run/session/archive-stage'))['runArchiveStage']
    | undefined;
};

// Active session epoch (symbol). Callbacks from previous epochs are ignored.
let ACTIVE_EPOCH: symbol | null = null;
const isActiveEpoch = (e: symbol) => ACTIVE_EPOCH === e;

const shouldWriteOrder =
  process.env.NODE_ENV === 'test' || process.env.STAN_WRITE_ORDER === '1';

export const runSessionOnce = async (args: {
  cwd: string;
  config: RunnerConfig;
  selection: string[];
  mode: ExecutionMode;
  behavior: RunBehavior;
  liveEnabled: boolean;
  planBody?: string;
  printPlan?: boolean;
  ui: RunnerUI;
  promptChoice?: string;
}): Promise<SessionOutcome> => {
  const {
    cwd,
    config,
    selection,
    mode,
    behavior,
    liveEnabled,
    planBody,
    printPlan,
    ui,
    promptChoice,
  } = args;

  // Epoch start
  const epoch = Symbol('session-epoch');
  ACTIVE_EPOCH = epoch;

  const outAbs = resolvePath(cwd, config.stanPath, 'output');
  const outRel = resolvePath(config.stanPath, 'output').replace(/\\/g, '/');

  // Optional order file (tests)
  const orderFile = await ensureOrderFile(
    shouldWriteOrder,
    outAbs,
    Boolean(behavior.keep),
  );

  // Resolve prompt up-front; early failure cancels this attempt.
  let resolvedPromptDisplay = '';
  let resolvedPromptAbs: string | null = null;
  try {
    const rp = resolvePromptOrThrow(cwd, config.stanPath, promptChoice);
    resolvedPromptDisplay = rp.display;
    resolvedPromptAbs = rp.abs;

    // Minimal, non-noisy diagnostics: exactly one line under STAN_DEBUG=1.
    try {
      if (process.env.STAN_DEBUG === '1') {
        // Prefer the kind returned by resolver; normalize slashes in the path for readability.
        const srcKind =
          (rp as unknown as { kind?: 'local' | 'core' | 'path' }).kind ??
          'path';
        const p = String(resolvedPromptAbs ?? '').replace(/\\/g, '/');
        // stderr only; do not change normal output
        console.error(`stan: debug: prompt: ${srcKind} ${p}`);
      }
    } catch {
      /* ignore */
    }
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
    console.error(`stan: error: unable to resolve system prompt (${msg})`);
    console.log('');
    try {
      ui.stop();
    } catch {
      /* ignore */
    }
    return { created: [], cancelled: true, restartRequested: false };
  }

  // Print plan once per outer loop (delegated by caller)
  if (printPlan && planBody) {
    printPlanWithPrompt(cwd, {
      selection,
      config,
      mode,
      behavior,
      planBody,
      ui,
      promptDisplay: resolvedPromptDisplay,
    });
  }

  ui.start();

  // Supervisor & cancellation
  const supervisor = new ProcessSupervisor({
    hangWarn: behavior.hangWarn,
    hangKill: behavior.hangKill,
    hangKillGrace: behavior.hangKillGrace,
  });
  const cancelCtl = new CancelController(ui, supervisor);

  // Wire UI cancellation keys (q/r)
  try {
    ui.installCancellation(
      () => cancelCtl.triggerCancel(),
      liveEnabled ? () => cancelCtl.triggerRestart() : undefined,
    );
  } catch {
    /* ignore */
  }

  // Session-wide SIGINT → cancel (parity)
  const onSigint = (): void => cancelCtl.triggerCancel();

  // Exit hook: stop UI, cancel, pause stdin — best-effort
  const detachSignals = attachSessionSignals(onSigint, async () => {
    liveTrace.session.exitHook();
    try {
      ui.stop();
    } catch {
      /* ignore */
    }
    try {
      supervisor.cancelAll({ immediate: true });
    } catch {
      /* ignore */
    }
    try {
      await supervisor.waitAll(3000);
    } catch {
      /* ignore */
    }
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      /* ignore */
    }
  });

  // Prepare UI: clear any previous rows and queue fresh ones
  try {
    (
      ui as unknown as { prepareForNewSession?: () => void }
    )?.prepareForNewSession?.();
  } catch {
    /* ignore */
  }
  const toRun = queueUiRows(ui, selection, config, Boolean(behavior.archive));
  cancelCtl.markQueued(toRun);
  // Immediate flush for the first frame
  try {
    (ui as unknown as { flushNow?: () => void })?.flushNow?.();
  } catch {
    /* ignore */
  }

  const created: string[] = [];

  // SCRIPTS PHASE
  if (toRun.length > 0) {
    const artifacts = await runScriptsPhase({
      cwd,
      outAbs,
      outRel,
      config,
      toRun,
      mode,
      orderFile,
      ui,
      epoch,
      isActive: isActiveEpoch,
      shouldContinue: () => !cancelCtl.isCancelled(),
      supervisor,
      liveEnabled,
      hangWarn: behavior.hangWarn,
      hangKill: behavior.hangKill,
      hangKillGrace: behavior.hangKillGrace,
    });
    created.push(...artifacts);
  }

  // Cancellation short-circuit (skip archives)
  if (cancelCtl.isCancelled() && !cancelCtl.isRestart()) {
    try {
      ui.stop();
    } catch {
      /* ignore */
    }
    if (liveEnabled) {
      console.log('');
    }
    try {
      await supervisor.waitAll(3000);
    } catch {
      /* ignore */
    }
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      /* ignore */
    }
    // extra settle for Windows
    try {
      const settleMs = process.platform === 'win32' ? 1600 : 400;
      await new Promise((r) => setTimeout(r, settleMs));
    } catch {
      /* ignore */
    }
    detachSignals();
    return { created, cancelled: true, restartRequested: false };
  }
  if (cancelCtl.isRestart()) {
    detachSignals();
    return { created, cancelled: true, restartRequested: true };
  }

  // Late-cancel guard: process any pending SIGINT/keypress before archiving.
  // This avoids a narrow race where cancellation arrives after scripts finish
  // but just before the archive phase begins, which could otherwise result in
  // archives being created despite user cancel. Yield once, then re-check.
  try {
    await yieldToEventLoop();
  } catch {
    /* ignore */
  }
  if (cancelCtl.isCancelled() && !cancelCtl.isRestart()) {
    try {
      ui.stop();
    } catch {
      /* ignore */
    }
    if (liveEnabled) {
      try {
        console.log('');
      } catch {
        /* ignore */
      }
    }
    try {
      await supervisor.waitAll(3000);
    } catch {
      /* ignore */
    }
    detachSignals();
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      /* ignore */
    }
    return { created, cancelled: true, restartRequested: false };
  }

  // Secondary late-cancel settle: absorb very-late SIGINT/keypress before archiving.
  // Some environments may deliver SIGINT just after the first yield above; add a
  // short delay + another yield to close the remaining sliver before archives.
  try {
    // Slightly longer on Windows to account for process signal delivery variance.
    // On POSIX CI, add a small extra cushion to absorb very-late delivery without
    // impacting local runs.
    const settleMs =
      process.platform === 'win32' ? 25 : process.env.CI ? 20 : 10;
    await new Promise((r) => setTimeout(r, settleMs));
  } catch {
    /* ignore */
  }
  try {
    await yieldToEventLoop();
  } catch {
    /* ignore */
  }
  if (cancelCtl.isCancelled() && !cancelCtl.isRestart()) {
    // Minimal trace to aid diagnosing rare late-cancel hits
    try {
      liveTrace.session.info(
        'late-cancel: cancelled between scripts and archive (secondary guard)',
      );
    } catch {
      /* ignore */
    }
    try {
      ui.stop();
    } catch {
      /* ignore */
    }
    if (liveEnabled) {
      try {
        console.log('');
      } catch {
        /* ignore */
      }
    }
    detachSignals();
    return { created, cancelled: true, restartRequested: false };
  }

  // ARCHIVE PHASE
  if (behavior.archive) {
    const runArchive = resolveRunArchiveStage();
    const a = runArchive
      ? await runArchive({
          cwd,
          config,
          behavior,
          ui,
          promptAbs: resolvedPromptAbs,
          promptDisplay: resolvedPromptDisplay,
        })
      : { created: [], cancelled: false };
    if (a.cancelled) {
      detachSignals();
      return { created, cancelled: true, restartRequested: false };
    }
    created.push(...a.created);
  }

  // Detach signals & exit
  liveTrace.session.info('normal path: detach signals, returning to caller');
  detachSignals();
  return { created, cancelled: false, restartRequested: false };
};

// Barrel re-exports for internal consumers/tests (avoid deep subpath imports).
export { CancelController } from './cancel-controller';
export { ensureOrderFile } from './order-file';
export { printPlanWithPrompt, resolvePromptOrThrow } from './prompt-plan';
export { runScriptsPhase } from './scripts-phase';
export { attachSessionSignals } from './signals';
export type { SessionArgs, SessionOutcome } from './types';
export { queueUiRows } from './ui-queue';
