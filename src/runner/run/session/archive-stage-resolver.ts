// src/runner/run/session/archive-stage-resolver.ts
import * as archiveStageMod from '@/runner/run/session/archive-stage';

/**
 * SSR‑robust picker for runArchiveStage from the archive-stage module.
 * Prefers named export; falls back to default.runArchiveStage when present.
 */
export type RunArchiveStageFn =
  (typeof import('@/runner/run/session/archive-stage'))['runArchiveStage'];

export const getRunArchiveStage = (): RunArchiveStageFn => {
  const mod = archiveStageMod as unknown as {
    runArchiveStage?: unknown;
    default?: { runArchiveStage?: unknown };
  };
  const named = mod?.runArchiveStage;
  const viaDefault = mod?.default?.runArchiveStage;
  const fn =
    typeof named === 'function'
      ? (named as RunArchiveStageFn)
      : typeof viaDefault === 'function'
        ? (viaDefault as RunArchiveStageFn)
        : undefined;
  if (!fn) throw new Error('runArchiveStage not found');
  return fn;
};
