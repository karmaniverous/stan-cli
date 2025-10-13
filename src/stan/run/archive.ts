import type { ContextConfig } from '@karmaniverous/stan-core';
import { createArchive, createArchiveDiff } from '@karmaniverous/stan-core';

import { stanDirs } from '@/stan/paths';
import {
  cleanupOutputsAfterCombine,
  cleanupPatchDirAfterArchive,
  stageImports,
} from '@/stan/run/archive/util';
import { alert, ok } from '@/stan/util/color';

// Progress callbacks for live renderer integration
type ArchiveProgress = {
  /** Called when a phase starts (kind: 'full' | 'diff'). */
  start?: (kind: 'full' | 'diff') => void;
  /**
   * Called when a phase completes.
   * @param kind - 'full' | 'diff'
   * @param pathAbs - Absolute path to the created archive
   * @param startedAt - ms epoch
   * @param endedAt - ms epoch
   */
  done?: (
    kind: 'full' | 'diff',
    pathAbs: string,
    startedAt: number,
    endedAt: number,
  ) => void;
};
/**
 * Run the archive phase and produce both regular and diff archives.
 *
 * @param args - Object with:
 *   - cwd: Repo root.
 *   - config: Resolved STAN configuration.
 *   - includeOutputs: When true, include `<stanPath>/output` inside archives.
 * @returns `{ archivePath, diffPath }` absolute paths to the created archives.
 */
export const archivePhase = async (
  args: {
    cwd: string;
    config: ContextConfig;
    includeOutputs: boolean;
  },
  opts?: { progress?: ArchiveProgress; silent?: boolean },
): Promise<{ archivePath: string; diffPath: string }> => {
  const { cwd, config, includeOutputs } = args;
  const silent = Boolean(opts?.silent);
  const dirs = stanDirs(cwd, config.stanPath);

  if (!silent) {
    console.log(`stan: start "${alert('archive')}"`);
  }

  let archivePath = '';
  let diffPath = '';
  try {
    // Stage imports (if any) so they are included in both archives.
    await stageImports(cwd, config.stanPath, config.imports);
    opts?.progress?.start?.('full');
    const startedFull = Date.now();
    archivePath = await createArchive(cwd, config.stanPath, {
      includeOutputDir: includeOutputs,
      includes: config.includes ?? [],
      excludes: config.excludes ?? [],
    });
    opts?.progress?.done?.('full', archivePath, startedFull, Date.now());
    if (!silent) {
      console.log(
        `stan: ${ok('done')} "${alert('archive')}" -> ${alert(
          archivePath.replace(/\\/g, '/'),
        )}`,
      );
    }

    if (!silent) {
      console.log(`stan: start "${alert('archive (diff)')}"`);
    }
    opts?.progress?.start?.('diff');
    const startedDiff = Date.now();
    ({ diffPath } = await createArchiveDiff({
      cwd,
      stanPath: config.stanPath,
      baseName: 'archive',
      includes: config.includes ?? [],
      excludes: config.excludes ?? [],
      updateSnapshot: 'createIfMissing',
      includeOutputDirInDiff: includeOutputs,
    }));
    opts?.progress?.done?.('diff', diffPath, startedDiff, Date.now());
    if (!silent) {
      console.log(
        `stan: ${ok('done')} "${alert('archive (diff)')}" -> ${alert(
          diffPath.replace(/\\/g, '/'),
        )}`,
      );
    }
  } finally {
    // No packaged prompt injection/restore; prompt is managed upstream for both full and diff.
  }
  if (includeOutputs) {
    await cleanupOutputsAfterCombine(dirs.output);
  }
  await cleanupPatchDirAfterArchive(cwd, config.stanPath);

  return { archivePath, diffPath };
};
