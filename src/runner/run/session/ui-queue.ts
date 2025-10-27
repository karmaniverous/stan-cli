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
  // Presentation-only pre-queue; swallow UI callback errors (SSR/mock robustness)
  for (const k of toRun) {
    try {
      ui.onScriptQueued(k);
    } catch {
      /* ignore pre-queue errors */
    }
  }
  if (includeArchives) {
    try {
      ui.onArchiveQueued('full');
    } catch {
      /* ignore */
    }
    try {
      ui.onArchiveQueued('diff');
    } catch {
      /* ignore */
    }
  }
  return toRun;
};
