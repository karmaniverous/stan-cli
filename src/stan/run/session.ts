// src/stan/run/session.ts
/**
 * One-shot run session (single attempt).
 * - Windows EBUSY hardening: add a slightly longer final settle after cancellation.
 * - Wires live/no-live UI, cancellation keys (q / Ctrl+C), and restart (r in live).
 * - Schedules scripts (concurrent|sequential) and optionally runs the archive phase.
 * - Preserves all existing logging semantics:
 *   - Plan printing is driven by the caller via printPlan + planBody.
 *   - Live mode renders the progress table; legacy "stan: start/done" archive
 *     lines remain suppressed.
 *   - No-live mode prints concise status lines.
 * - Returns created artifact paths and signals cancellation or restart.
 */
import { resolve } from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';

import { liveTrace } from '@/stan/run/live/trace';
import { runArchivePhaseAndCollect } from '@/stan/run/session/invoke-archive';
import { ensureOrderFile } from '@/stan/run/session/order-file';
import { attachSessionSignals } from '@/stan/run/session/signals';
import { queueUiRows } from '@/stan/run/session/ui-queue';

import { runScripts } from './exec';
import { ProcessSupervisor } from './live/supervisor';
import type { ExecutionMode, RunBehavior } from './types';
import type { RunnerUI } from './ui';

const shouldWriteOrder =
  process.env.NODE_ENV === 'test' || process.env.STAN_WRITE_ORDER === '1';

export const runSessionOnce = async (args: {
  cwd: string;
  config: ContextConfig;
  selection: string[];
  mode: ExecutionMode;
  behavior: RunBehavior;
  liveEnabled: boolean;
  planBody?: string;
  printPlan?: boolean;
  ui: RunnerUI;
}): Promise<{
  created: string[];
  cancelled: boolean;
  restartRequested: boolean;
}> => {
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
  } = args;

  const outputAbs = resolve(cwd, config.stanPath, 'output');
  const outputRel = resolve(config.stanPath, 'output').replace(/\\/g, '/');
  const dirs = { outputAbs, outputRel };
  const outAbs = dirs.outputAbs;
  const outRel = dirs.outputRel;

  // Optional order file (tests)
  const orderFile = await ensureOrderFile(
    shouldWriteOrder,
    outAbs,
    Boolean(behavior.keep),
  );

  // Print plan once per outer loop (delegated by caller)
  if (printPlan && planBody) {
    ui.onPlan(planBody);
    // Preserve a trailing blank line after the plan (legacy spacing)
    console.log('');
  }

  ui.start();
  // Prepare UI for a new session: drop any previous rows (e.g., cancelled from restart).
  try {
    (
      ui as unknown as { prepareForNewSession?: () => void }
    )?.prepareForNewSession?.();
  } catch {
    /* ignore */
  }
  // Build run list and pre-register UI rows so the table shows full schedule up front
  const toRun = queueUiRows(ui, selection, config, Boolean(behavior.archive));
  // Flush immediately so the first frame shows new waiting/run rows without delay.
  try {
    (ui as unknown as { flushNow?: () => void })?.flushNow?.();
  } catch {
    /* ignore */
  }

  // Cancellation/restart wiring
  const supervisor = new ProcessSupervisor({
    hangWarn: behavior.hangWarn,
    hangKill: behavior.hangKill,
    hangKillGrace: behavior.hangKillGrace,
  });
  let cancelled = false;
  let restartRequested = false;
  const cancelledKeys = new Set<string>();
  let wakeCancelOrRestart: (() => void) | null = null;
  const cancelOrRestart = new Promise<void>((resolveWake) => {
    wakeCancelOrRestart = resolveWake;
  });

  const triggerCancel = (): void => {
    if (cancelled) return;
    cancelled = true;
    for (const k of toRun) cancelledKeys.add(`script:${k}`);
    try {
      ui.onCancelled('cancel');
    } catch {
      /* ignore */
    }
    try {
      supervisor.cancelAll({ immediate: true });
    } catch {
      /* ignore */
    }
    try {
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') process.exit(1);
    } catch {
      /* ignore */
    }
    try {
      wakeCancelOrRestart?.();
    } catch {
      /* ignore */
    }
  };

  const triggerRestart = (): void => {
    if (restartRequested) return;
    restartRequested = true;
    cancelled = true;
    try {
      ui.onCancelled('restart');
    } catch {
      /* ignore */
    }
    try {
      supervisor.cancelAll({ immediate: true });
    } catch {
      /* ignore */
    }
    try {
      wakeCancelOrRestart?.();
    } catch {
      /* ignore */
    }
  };

  // Session-wide SIGINT → cancel (parity for live/no-live)
  const onSigint = (): void => triggerCancel();

  // Keys: live wires restart; logger wires SIGINT parity only
  ui.installCancellation(
    triggerCancel,
    liveEnabled ? triggerRestart : undefined,
  );

  // Central exit hook: best-effort teardown on real exits
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

  const created: string[] = [];
  let collectPromise: Promise<void> | null = null;
  // Run scripts (if any)
  if (toRun.length > 0) {
    collectPromise = runScripts(
      cwd,
      outAbs,
      outRel,
      config,
      toRun,
      mode,
      orderFile,
      {
        onStart: (key) => ui.onScriptStart(key),
        onEnd: (key, outFileAbs, startedAt, endedAt, code, status) => {
          if (cancelled && cancelledKeys.has(`script:${key}`)) return;
          ui.onScriptEnd(
            key,
            outFileAbs,
            cwd,
            startedAt,
            endedAt,
            code,
            status,
          );
          if (status === 'error' || (typeof code === 'number' && code !== 0)) {
            process.exitCode = 1;
          }
        },
        silent: true,
        onHangWarn: (key, seconds) => {
          if (!liveEnabled) {
            console.log(
              `stan: ⏱ stalled "${key}" after ${seconds}s of inactivity`,
            );
          }
        },
        onHangTimeout: (key, seconds) => {
          if (!liveEnabled) {
            console.log(
              `stan: ⏱ timeout "${key}" after ${seconds}s; sending SIGTERM`,
            );
          }
        },
        onHangKilled: (key, grace) => {
          if (!liveEnabled) {
            console.log(`stan: ◼ killed "${key}" after ${grace}s grace`);
          }
        },
      },
      {
        silent: true,
        hangWarn: behavior.hangWarn,
        hangKill: behavior.hangKill,
        hangKillGrace: behavior.hangKillGrace,
      } as unknown as {
        silent?: boolean;
        hangWarn?: number;
        hangKill?: number;
        hangKillGrace?: number;
      },
      () => !cancelled,
      supervisor,
    ).then((outs) => {
      created.push(...outs);
    });
    void collectPromise.catch?.(() => {});
    await Promise.race([collectPromise, cancelOrRestart]);
  }

  // Cancellation short-circuit (skip archives)
  if (cancelled) {
    try {
      if (!restartRequested) {
        liveTrace.session.info('cancel path: ui.stop()');
        ui.stop();
      }
    } catch {
      /* ignore */
    }
    if (liveEnabled && !restartRequested) {
      console.log('');
    }
    try {
      if (collectPromise) {
        await Promise.race([
          collectPromise,
          new Promise((r) => setTimeout(r, 2500)),
        ]);
      }
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
    try {
      const settleMs = process.platform === 'win32' ? 1600 : 400;
      await new Promise((r) => setTimeout(r, settleMs));
    } catch {
      /* ignore */
    }
    detachSignals();
    return { created, cancelled: true, restartRequested };
  }

  // Late-cancellation guard before archiving
  {
    try {
      await new Promise((r) => setImmediate(r));
    } catch {
      /* ignore */
    }
    if (cancelled) {
      detachSignals();
      return { created, cancelled: true, restartRequested };
    }
  }

  // ARCHIVE PHASE
  if (behavior.archive) {
    const includeOutputs = Boolean(behavior.combine);
    const { archivePath, diffPath } = await runArchivePhaseAndCollect({
      cwd,
      config,
      includeOutputs,
      ui,
    });
    created.push(archivePath, diffPath);
  }

  // Detach signals & exit hook before returning
  liveTrace.session.info(
    'normal path: detach signals, returning to caller (no ui.stop() here)',
  );
  detachSignals();
  return { created, cancelled: false, restartRequested };
};
