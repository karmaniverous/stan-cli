import { readdir, rm } from 'node:fs/promises';
import path, { resolve } from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import {
  createArchive,
  createArchiveDiff,
  prepareImports,
} from '@karmaniverous/stan-core';

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
 * Remove on‑disk script outputs after combine mode archived them.
 * Keeps `archive.tar` and `archive.diff.tar` in place.
 * @param outAbs - Absolute path to `<stanPath>/output`.
 */
const cleanupOutputsAfterCombine = async (outAbs: string): Promise<void> => {
  const entries = await readdir(outAbs, { withFileTypes: true });
  const keepNames = new Set(['archive.tar', 'archive.diff.tar']);
  await Promise.all(
    entries.map(async (e) => {
      if (keepNames.has(e.name)) return;
      await rm(resolve(outAbs, e.name), { recursive: true, force: true });
    }),
  );
};

const makeDirs = (cwd: string, stanPath: string) => ({
  outputAbs: path.join(cwd, stanPath, 'output'),
  patchAbs: path.join(cwd, stanPath, 'patch'),
});

/**
 * Clear `<stanPath>/patch` contents after archiving (preserve the directory).
 *
 * Removes files under the patch workspace so subsequent archives include
 * a clean patch directory while preserving the directory itself.
 *
 * @param cwd - Repository root.
 * @param stanPath - STAN workspace folder.
 */
const cleanupPatchDirAfterArchive = async (
  cwd: string,
  stanPath: string,
): Promise<void> => {
  const dirs = makeDirs(cwd, stanPath);
  try {
    const entries = await readdir(dirs.patchAbs, { withFileTypes: true });
    await Promise.all(
      entries.map((e) =>
        rm(resolve(dirs.patchAbs, e.name), { recursive: true, force: true }),
      ),
    );
  } catch {
    // best-effort
  }
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
  const dirs = makeDirs(cwd, config.stanPath);

  if (!silent) {
    console.log(`stan: start "${alert('archive')}"`);
  }

  let archivePath = '';
  let diffPath = '';
  try {
    // Stage imports (if any) so they are included in both archives.
    try {
      if (config.imports && typeof config.imports === 'object') {
        await prepareImports({
          cwd,
          stanPath: config.stanPath,
          map: config.imports,
        });
      }
    } catch {
      // best‑effort; continue without imports on failure
    }
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
    await cleanupOutputsAfterCombine(dirs.outputAbs);
  }
  await cleanupPatchDirAfterArchive(cwd, config.stanPath);

  return { archivePath, diffPath };
};
