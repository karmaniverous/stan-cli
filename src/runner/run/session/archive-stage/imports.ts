import * as archiveMod from '@/runner/run/archive';

type ArchiveModule = typeof import('@/runner/run/archive');

/** SSR‑robust picker for archivePhase from the archive module. */
export const getArchivePhase = (): ArchiveModule['archivePhase'] => {
  const mod = archiveMod as unknown as {
    archivePhase?: unknown;
    default?: unknown;
  };

  // 1) Named export
  const named = (mod as { archivePhase?: unknown }).archivePhase;
  if (typeof named === 'function') {
    return named as ArchiveModule['archivePhase'];
  }

  const defAny = (mod as { default?: unknown }).default;

  // 2) default as function (rare shape)
  if (typeof defAny === 'function') {
    return defAny as unknown as ArchiveModule['archivePhase'];
  }

  // 3) default.archivePhase (default object with property) + shallow scan
  if (defAny && typeof defAny === 'object') {
    const viaProp = (defAny as { archivePhase?: unknown }).archivePhase;
    if (typeof viaProp === 'function')
      return viaProp as ArchiveModule['archivePhase'];
    for (const v of Object.values(defAny as Record<string, unknown>)) {
      if (typeof v === 'function') {
        return v as ArchiveModule['archivePhase'];
      }
    }
  }

  // 5) Module‑as‑function (extreme edge)
  if (typeof (archiveMod as unknown) === 'function') {
    return archiveMod as unknown as ArchiveModule['archivePhase'];
  }

  throw new Error('archivePhase not found');
};

/** SSR‑robust picker for stageImports from the archive module. */
export const getStageImports = (): ArchiveModule['stageImports'] => {
  const mod = archiveMod as unknown as {
    stageImports?: unknown;
    default?: unknown;
  };

  // 1) Named export
  const named = (mod as { stageImports?: unknown }).stageImports;
  if (typeof named === 'function') {
    return named as ArchiveModule['stageImports'];
  }

  const defAny = (mod as { default?: unknown }).default;

  // 2) default as function (rare shape)
  if (typeof defAny === 'function') {
    return defAny as unknown as ArchiveModule['stageImports'];
  }

  // 3) default.stageImports (default object with property) + shallow scan
  if (defAny && typeof defAny === 'object') {
    const viaProp = (defAny as { stageImports?: unknown }).stageImports;
    if (typeof viaProp === 'function')
      return viaProp as ArchiveModule['stageImports'];
    for (const v of Object.values(defAny as Record<string, unknown>)) {
      if (typeof v === 'function') {
        return v as ArchiveModule['stageImports'];
      }
    }
  }

  // 5) Module‑as‑function (extreme edge)
  if (typeof (archiveMod as unknown) === 'function') {
    return archiveMod as unknown as ArchiveModule['stageImports'];
  }

  throw new Error('stageImports not found');
};
