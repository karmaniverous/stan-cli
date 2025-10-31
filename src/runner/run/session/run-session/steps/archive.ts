// src/runner/run/session/run-session/steps/archive.ts
import type { ProcessSupervisor } from '@/runner/run/live/supervisor';
import { getRunArchiveStage } from '@/runner/run/session/archive-stage-resolver';
import { removeArchivesIfAny } from '@/runner/run/session/run-session/cleanup';
import { preArchiveScheduleGuard } from '@/runner/run/session/run-session/guards';
import type { SessionOutcome } from '@/runner/run/session/types';
import type { RunBehavior, RunnerConfig } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

export type CancelCtlLike = {
  isCancelled(): boolean;
  isRestart(): boolean;
};
export type DepsLike = {
  created: string[];
  ui: RunnerUI;
  detachSignals: () => void;
  outAbs: string;
  supervisor: ProcessSupervisor;
};

/**
 * Run the archive phase if enabled and return:
 * - \{ short: SessionOutcome \} when the session should return early,
 * - \{ added \} when archives completed and were appended to created[].
 */
export async function runArchiveIfEnabled(args: {
  enabled: boolean;
  cancelCtl: CancelCtlLike;
  deps: DepsLike;
  cwd: string;
  config: RunnerConfig;
  behavior: RunBehavior;
  ui: RunnerUI;
  promptAbs: string | null;
  promptDisplay: string;
  supervisor: ProcessSupervisor;
}): Promise<{ short?: SessionOutcome; added?: string[] }> {
  const {
    enabled,
    cancelCtl,
    deps,
    cwd,
    config,
    behavior,
    ui,
    promptAbs,
    promptDisplay,
    supervisor,
  } = args;
  if (!enabled) return {};

  // Guard just before scheduling the archive stage
  const guard = await preArchiveScheduleGuard(cancelCtl, {
    created: deps.created,
    ui: deps.ui,
    supervisor,
    detachSignals: deps.detachSignals,
    liveEnabled: true,
    outAbs: deps.outAbs,
  });
  if (guard) return { short: guard };

  const runArchive = getRunArchiveStage();
  const a = await runArchive({
    cwd,
    config,
    behavior,
    ui,
    promptAbs,
    promptDisplay,
    shouldContinue: () => !cancelCtl.isCancelled(),
  });
  if (a.cancelled) {
    return {
      short: { created: deps.created, cancelled: true, restartRequested: true },
    };
  }
  if (cancelCtl.isCancelled() && !cancelCtl.isRestart()) {
    await Promise.all(
      a.created.map((p) =>
        import('node:fs/promises').then(({ rm }) => rm(p, { force: true })),
      ),
    ).catch(() => void 0);

    await removeArchivesIfAny(deps.outAbs).catch(() => void 0);
    try {
      deps.detachSignals();
    } catch {
      /* ignore */
    }
    return {
      short: {
        created: deps.created,
        cancelled: true,
        restartRequested: false,
      },
    };
  }
  return { added: a.created };
}
