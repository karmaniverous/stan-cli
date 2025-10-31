// src/runner/run/session/run-session/orchestrator.ts
import { resolve as resolvePath } from 'node:path';

import { liveTrace, ProcessSupervisor } from '@/runner/run/live';
import { CancelController } from '@/runner/run/session/cancel-controller';
import { beginEpoch, isActiveEpoch } from '@/runner/run/session/epoch';
import { ensureOrderFile } from '@/runner/run/session/order-file';
import { runScriptsPhase } from '@/runner/run/session/scripts-phase';
import { attachSessionSignals } from '@/runner/run/session/signals';
import type { SessionOutcome } from '@/runner/run/session/types';
import type { RunnerConfig } from '@/runner/run/types';
import type { ExecutionMode, RunBehavior } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

import { flushUiOnce, postArchiveSettle } from './finalize';
import { runArchiveIfEnabled } from './steps/archive';
import { runAllCancelGuards } from './steps/cancel-check';
import { resolvePromptAndMaybePrintPlan } from './steps/prompt';
import { queueRowsAndMark } from './steps/queue';
// Decomposed step helpers
import { prepareUiForNewSession, startUiAndEnsureFirstFrame } from './steps/ui';

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

  // Resolve prompt & maybe print plan; then start UI and ensure a first frame
  const { display: resolvedPromptDisplay, abs: resolvedPromptAbs } =
    resolvePromptAndMaybePrintPlan({
      cwd,
      config,
      selection,
      mode,
      behavior,
      ui,
      planBody,
      printPlan,
      promptChoice,
    });

  startUiAndEnsureFirstFrame(ui);

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

  // Prepare UI and queue fresh rows
  prepareUiForNewSession(ui);
  const toRun = queueRowsAndMark({
    ui,
    selection,
    config,
    includeArchives: Boolean(behavior.archive),
    cancelCtl,
  });

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

  // Centralized cancellation guards
  const deps = {
    created,
    ui,
    supervisor,
    detachSignals,
    liveEnabled,
    outAbs,
  };
  const early = await runAllCancelGuards(cancelCtl, deps);
  if (early) return early;

  // ARCHIVE PHASE
  if (behavior.archive) {
    const { short, added } = await runArchiveIfEnabled({
      enabled: true,
      cancelCtl,
      deps: { created, ui, detachSignals, outAbs },
      cwd,
      config,
      behavior,
      ui,
      promptAbs: resolvedPromptAbs,
      promptDisplay: resolvedPromptDisplay,
      supervisor,
    });
    if (short) return short;
    if (added?.length) created.push(...added);
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
