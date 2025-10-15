// src/stan/run/session/ui-queue.ts
import type { RunnerConfig } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

/**
+ * Filter selection against config and queue initial rows in the UI.
+ *
 * @returns Resolved script list to run (config-filtered).
 */
export const queueUiRows = (
  ui: RunnerUI,
  selection: string[] | null | undefined,
  config: RunnerConfig,
  includeArchives: boolean,
): string[] => {
  const toRun = (selection ?? []).filter((k) =>
    Object.prototype.hasOwnProperty.call(config.scripts, k),
  );
  for (const k of toRun) ui.onScriptQueued(k);
  if (includeArchives) {
    ui.onArchiveQueued('full');
    ui.onArchiveQueued('diff');
  }
  return toRun;
};
