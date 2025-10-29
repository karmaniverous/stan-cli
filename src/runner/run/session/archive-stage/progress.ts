// src/runner/run/session/archive-stage/progress.ts
import type { RunnerUI } from '@/runner/run/ui';
import type { ArchiveKind } from '@/runner/run/ui/types';

/** UI progress callbacks wired to archive rows. */
export const buildArchiveProgress = (
  ui: RunnerUI,
  cwd: string,
): {
  start: (k: ArchiveKind) => void;
  done: (k: ArchiveKind, p: string, s: number, e: number) => void;
} => {
  return {
    start: (k: ArchiveKind) => {
      ui.onArchiveStart(k);
    },
    done: (k: ArchiveKind, p: string, s: number, e: number) => {
      // ui expects repo‑relative output path
      ui.onArchiveEnd(k, p, cwd, s, e);
    },
  };
};
