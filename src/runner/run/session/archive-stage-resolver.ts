/**
 * SSR-robust resolver for the archive stage entrypoint.
 * @module
 */
import { resolveCallableExport } from '@/common/interop/resolve';
import * as archiveStageMod from '@/runner/run/session/archive-stage';

/**
 * SSR‑robust picker for runArchiveStage from the archive-stage module.
 * Prefers named export; falls back to default.runArchiveStage when present.
 */
export type RunArchiveStageFn =
  (typeof import('@/runner/run/session/archive-stage'))['runArchiveStage'];

export const getRunArchiveStage = (): RunArchiveStageFn => {
  return resolveCallableExport<RunArchiveStageFn>(
    archiveStageMod as unknown,
    'runArchiveStage',
    { maxDefaultDepth: 2 },
  );
};
