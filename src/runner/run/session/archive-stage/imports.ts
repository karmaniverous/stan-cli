import * as archiveMod from '@/runner/run/archive';

type ArchiveModule = typeof import('@/runner/run/archive');

/** SSR‑robust picker for archivePhase from the archive module. */
export const getArchivePhase = (): ArchiveModule['archivePhase'] => {
  const mod = archiveMod as unknown as {
    archivePhase?: unknown;
    default?: { archivePhase?: unknown } | ((...a: unknown[]) => unknown);
  };

  // 1) Named export
  const named = (mod as { archivePhase?: unknown }).archivePhase;
  if (typeof named === 'function') {
    return named as ArchiveModule['archivePhase'];
  }

  // 2) default.archivePhase (default object with property)
  const viaDefaultObj =
    typeof mod.default === 'object' && mod.default !== null
      ? (mod.default as { archivePhase?: unknown }).archivePhase
      : undefined;
  if (typeof viaDefaultObj === 'function') {
    return viaDefaultObj as ArchiveModule['archivePhase'];
  }

  // 3) default as function (rare shape)
  const viaDefaultFn =
    typeof mod.default === 'function'
      ? (mod.default as unknown as ArchiveModule['archivePhase'])
      : undefined;
  if (typeof viaDefaultFn === 'function') {
    return viaDefaultFn;
  }

  // 4) Shallow scan of values on default object (edge mocks)
  if (typeof mod.default === 'object' && mod.default !== null) {
    for (const v of Object.values(mod.default as Record<string, unknown>)) {
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
    default?: { stageImports?: unknown } | ((...a: unknown[]) => unknown);
  };

  // 1) Named export
  const named = (mod as { stageImports?: unknown }).stageImports;
  if (typeof named === 'function') {
    return named as ArchiveModule['stageImports'];
  }

  // 2) default.stageImports (default object with property)
  const viaDefaultObj =
    typeof mod.default === 'object' && mod.default !== null
      ? (mod.default as { stageImports?: unknown }).stageImports
      : undefined;
  if (typeof viaDefaultObj === 'function') {
    return viaDefaultObj as ArchiveModule['stageImports'];
  }

  // 3) default as function (rare shape)
  const viaDefaultFn =
    typeof mod.default === 'function'
      ? (mod.default as unknown as ArchiveModule['stageImports'])
      : undefined;
  if (typeof viaDefaultFn === 'function') {
    return viaDefaultFn;
  }

  // 4) Shallow scan of values on default object (edge mocks)
  if (typeof mod.default === 'object' && mod.default !== null) {
    for (const v of Object.values(mod.default as Record<string, unknown>)) {
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
