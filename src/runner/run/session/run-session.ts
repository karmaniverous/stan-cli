// src/runner/run/session/run-session.ts
import { resolve as resolvePath } from 'node:path';

import { yieldToEventLoop } from '@/runner/run/exec/util';
import { liveTrace, ProcessSupervisor } from '@/runner/run/live';
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

import {
  getRunArchiveStage,
  type RunArchiveStageFn,
} from './archive-stage-resolver';
import { CancelController } from './cancel-controller';
import { beginEpoch, isActiveEpoch } from './epoch';
import { runScriptsPhase } from './scripts-phase';
import type { SessionOutcome } from './types';

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
  const epoch = beginEpoch();

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
    // Minimal debug line when enabled
    try {
      if (process.env.STAN_DEBUG === '1') {
        const srcKind =
          (rp as unknown as { kind?: 'local' | 'core' | 'path' }).kind ??
          'path';
        const p = String(resolvedPromptAbs ?? '').replace(/\\/g, '/');
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

  // Late-cancel guard: yield once and re-check before archive.
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

  // Secondary late-cancel settle
  try {
    const settleMs =
      process.platform === 'win32' ? 25 : process.env.CI ? 20 : 10;
    await new Promise((r) => setTimeout(r, settleMs));
    await yieldToEventLoop();
  } catch {
    /* ignore */
  }
  if (cancelCtl.isCancelled() && !cancelCtl.isRestart()) {
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
    const runArchive: RunArchiveStageFn = getRunArchiveStage();
    const a: { created: string[]; cancelled: boolean } = await runArchive({
      cwd,
      config,
      behavior,
      ui,
      promptAbs: resolvedPromptAbs,
      promptDisplay: resolvedPromptDisplay,
    });
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
