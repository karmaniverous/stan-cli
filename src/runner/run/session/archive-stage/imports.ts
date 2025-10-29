// src/runner/run/session/archive-stage/imports.ts
import * as archiveMod from '@/runner/run/archive';

type ArchiveModule = typeof import('@/runner/run/archive');

/** SSR‑robust picker for archivePhase from the archive module. */
export const getArchivePhase = (): ArchiveModule['archivePhase'] => {
  const mod = archiveMod as unknown as {
    archivePhase?: unknown;
    default?: { archivePhase?: unknown };
  };
  const named = mod.archivePhase;
  const viaDefault = mod.default?.archivePhase;
  const fn =
    typeof named === 'function'
      ? (named as ArchiveModule['archivePhase'])
      : typeof viaDefault === 'function'
        ? (viaDefault as ArchiveModule['archivePhase'])
        : undefined;
  if (!fn) throw new Error('archivePhase not found');
  return fn;
};

/** SSR‑robust picker for stageImports from the archive module. */
export const getStageImports = (): ArchiveModule['stageImports'] => {
  const mod = archiveMod as unknown as {
    stageImports?: unknown;
    default?: { stageImports?: unknown };
  };
  const named = mod.stageImports;
  const viaDefault = mod.default?.stageImports;
  const fn =
    typeof named === 'function'
      ? (named as ArchiveModule['stageImports'])
      : typeof viaDefault === 'function'
        ? (viaDefault as ArchiveModule['stageImports'])
        : undefined;
  if (!fn) throw new Error('stageImports not found');
  return fn;
};
