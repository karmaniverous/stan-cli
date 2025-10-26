// src/runner/run/session/archive-stage-resolver.ts
import type * as ArchiveStageModule from '@/runner/run/session/archive-stage';

/**
 * SSR‑robust picker for runArchiveStage from the archive-stage module.
 * Prefers named export; falls back to default.runArchiveStage when present.
 */
export const getRunArchiveStage = (): ArchiveStageModule['runArchiveStage'] => {
  // Local import to avoid circular dependencies in barrels and keep this testable.

  const mod = require('./archive-stage') as unknown as {
    runArchiveStage?: unknown;
    default?: { runArchiveStage?: unknown };
  };
  const named = mod?.runArchiveStage;
  const viaDefault = mod?.default?.runArchiveStage;
  const fn =
    typeof named === 'function'
      ? (named as ArchiveStageModule['runArchiveStage'])
      : typeof viaDefault === 'function'
        ? (viaDefault as ArchiveStageModule['runArchiveStage'])
        : undefined;
  if (!fn) throw new Error('runArchiveStage not found');
  return fn;
};
