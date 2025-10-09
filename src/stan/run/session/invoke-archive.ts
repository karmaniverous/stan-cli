// src/stan/run/session/invoke-archive.ts
import type { ContextConfig } from '@karmaniverous/stan-core';

import { archivePhase } from '@/stan/run/archive';
import type { RunnerUI } from '@/stan/run/ui';

export const runArchivePhaseAndCollect = async (args: {
  cwd: string;
  config: ContextConfig;
  includeOutputs: boolean;
  ui: RunnerUI;
}): Promise<{ archivePath: string; diffPath: string }> => {
  const { cwd, config, includeOutputs, ui } = args;
  const { archivePath, diffPath } = await archivePhase(
    { cwd, config, includeOutputs },
    {
      silent: true,
      progress: {
        start: (kind) => ui.onArchiveStart(kind),
        done: (kind, pathAbs, startedAt, endedAt) =>
          ui.onArchiveEnd(kind, pathAbs, cwd, startedAt, endedAt),
      },
    },
  );
  return { archivePath, diffPath };
};
