// src/runner/run/session/run-session/orchestrator.ts
import { resolve as resolvePath } from 'node:path';

import { liveTrace, ProcessSupervisor } from '@/runner/run/live';
import { getRunArchiveStage } from '@/runner/run/session/archive-stage-resolver';
import { CancelController } from '@/runner/run/session/cancel-controller';
import { beginEpoch, isActiveEpoch } from '@/runner/run/session/epoch';
import { ensureOrderFile } from '@/runner/run/session/order-file';
import {
  printPlanWithPrompt,
  resolvePromptOrThrow,
} from '@/runner/run/session/prompt-plan';
import { runScriptsPhase } from '@/runner/run/session/scripts-phase';
import { attachSessionSignals } from '@/runner/run/session/signals';
import type { SessionOutcome } from '@/runner/run/session/types';
import { queueUiRows } from '@/runner/run/session/ui-queue';
import type { RunnerConfig } from '@/runner/run/types';
import type { ExecutionMode, RunBehavior } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

import { restartAndReturn } from './cancel';
import { removeArchivesIfAny } from './cleanup';
import { flushUiOnce, postArchiveSettle } from './finalize';
import {
  type CancelDeps,
  checkCancelNow,
  preArchiveScheduleGuard,
  settleAndCheckCancel,
  yieldAndCheckCancel,
} from './guards';

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
          (rp as unknown as { kind?: 'local' | 'core' | 'path' }).kind ||
          'path';
        const p = (resolvedPromptAbs || '').replace(/\\/g, '/');
        console.error(`stan: debug: prompt: ${srcKind} ${p}`);
      }
    } catch {
      /* ignore */
    }
  } catch (e) {
    // Proceed without an injected prompt: archiving will continue in non-ephemeral mode.
    const msg =
      e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
    console.error(
      `stan: warn: proceeding without resolved system prompt (${msg})`,
    );
    console.log('');
    resolvedPromptDisplay = 'auto (unresolved)';
    resolvedPromptAbs = null;
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

  // Ensure at least one immediate render occurs even for very fast runs
  // so that a frame containing the hint is present in TTY logs before
  // the final persisted frame replaces it.
  try {
    const flush = (ui as unknown as { flushNow?: () => void }).flushNow;
    if (typeof flush === 'function') flush();
  } catch {
    /* best-effort */
  }
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
      () => {
        cancelCtl.triggerCancel();
      },
      liveEnabled
        ? () => {
            cancelCtl.triggerRestart();
          }
        : undefined,
    );
  } catch {
    /* ignore */
  }

  // Session-wide SIGINT → cancel (parity)
  const onSigint = (): void => {
    cancelCtl.triggerCancel();
  };

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
      const pause = (process.stdin as unknown as { pause?: () => void }).pause;
      if (typeof pause === 'function') {
        pause();
      }
    } catch {
      /* ignore */
    }
  });

  // Prepare UI: clear any previous rows and queue fresh ones
  try {
    const prep = (ui as unknown as { prepareForNewSession?: () => void })
      .prepareForNewSession;
    if (typeof prep === 'function') prep();
  } catch {
    /* ignore */
  }
  const toRun = queueUiRows(ui, selection, config, Boolean(behavior.archive));
  cancelCtl.markQueued(toRun);
  try {
    const flush = (ui as unknown as { flushNow?: () => void }).flushNow;
    if (typeof flush === 'function') flush();
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

  // Cancellation guards (centralized)
  const deps: CancelDeps = {
    created,
    ui,
    supervisor,
    detachSignals,
    liveEnabled,
    outAbs,
  };
  const now = await checkCancelNow(cancelCtl, deps);
  if (now) return now;

  const afterYield = await yieldAndCheckCancel(cancelCtl, deps);
  if (afterYield) return afterYield;

  const afterSettle = await settleAndCheckCancel(cancelCtl, deps);
  if (afterSettle) return afterSettle;

  // ARCHIVE PHASE
  if (behavior.archive) {
    // Guard immediately before scheduling
    const guard = await preArchiveScheduleGuard(cancelCtl, deps);
    if (guard) return guard;

    const runArchive = getRunArchiveStage();
    const a = await runArchive({
      cwd,
      config,
      behavior,
      ui,
      promptAbs: resolvedPromptAbs,
      promptDisplay: resolvedPromptDisplay,
      shouldContinue: () => !cancelCtl.isCancelled(),
    });
    if (a.cancelled) {
      return restartAndReturn({ created, detachSignals });
    }

    // Late-cancel guard after archive completed: clean up created artifacts best-effort.
    if (cancelCtl.isCancelled() && !cancelCtl.isRestart()) {
      try {
        await Promise.all(
          a.created.map((p) =>
            import('node:fs/promises').then(({ rm }) => rm(p, { force: true })),
          ),
        );
      } catch {
        /* ignore */
      }
      await removeArchivesIfAny(outAbs).catch(() => void 0);
      try {
        detachSignals();
      } catch {
        /* ignore */
      }
      return { created, cancelled: true, restartRequested: false };
    }
    created.push(...a.created);
  }

  // Finalization: settle & flush for immediate visibility/parity
  await postArchiveSettle();
  await flushUiOnce(ui);

  liveTrace.session.info('normal path: detach signals, returning to caller');
  try {
    detachSignals();
  } catch {
    /* ignore */
  }
  return { created, cancelled: false, restartRequested: false };
};
