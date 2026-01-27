// src/runner/run/session/run-session/steps/queue.ts
import type { CancelController } from '@/runner/run/session/cancel-controller';
import { queueUiRows } from '@/runner/run/session/ui-queue';
import type { RunnerConfig } from '@/runner/run/types';
import type { ArchiveKind, RunnerUI } from '@/runner/run/ui';

/**
 * Queue script rows (and archive rows when applicable), mark cancelled keys,
 * and perform a best-effort immediate flush for visibility.
 *
 * @returns Resolved list of script keys to run.
 */
export function queueRowsAndMark(args: {
  ui: RunnerUI;
  selection: string[];
  config: RunnerConfig;
  includeArchives: boolean;
  primaryArchiveKind?: ArchiveKind;
  skipDiff?: boolean;
  cancelCtl: CancelController;
}): string[] {
  const {
    ui,
    selection,
    config,
    includeArchives,
    primaryArchiveKind,
    skipDiff,
    cancelCtl,
  } = args;
  const toRun = queueUiRows(ui, selection, config, includeArchives, {
    primaryArchiveKind,
    skipDiff,
  });
  cancelCtl.markQueued(toRun);
  try {
    const flush = (ui as unknown as { flushNow?: () => void }).flushNow;
    if (typeof flush === 'function') {
      flush();
    }
  } catch {
    /* ignore */
  }
  return toRun;
}
