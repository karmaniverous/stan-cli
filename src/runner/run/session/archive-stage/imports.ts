/**
 * SSR-robust pickers for archive utilities (named export preferred).
 * @module
 */
import * as archiveMod from '@/runner/run/archive';

type ArchiveModule = typeof import('@/runner/run/archive');

import { resolveCallableExport } from '@/common/interop/resolve';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const resolveArchiveExport = <F>(name: string): F => {
  return resolveCallableExport<F>(archiveMod as unknown, name, {
    // Preserve prior behavior: tolerate callable defaults and module-as-function mocks.
    allowDefaultCallable: true,
    allowModuleCallable: true,
    scanDefaultObject: true,
    maxDefaultDepth: 3,
  });
};

/** SSR‑robust picker for `archivePhase` from the archive module. */
export const getArchivePhase = (): ArchiveModule['archivePhase'] =>
  resolveArchiveExport<ArchiveModule['archivePhase']>('archivePhase');

/** SSR‑robust picker for `stageImports` from the archive module. */
export const getStageImports = (): ArchiveModule['stageImports'] =>
  resolveArchiveExport<ArchiveModule['stageImports']>('stageImports');
