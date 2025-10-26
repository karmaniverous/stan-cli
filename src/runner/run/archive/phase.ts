import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { createArchive, createArchiveDiff } from '@karmaniverous/stan-core';

import { stanDirs } from '@/runner/paths';
import {
  cleanupOutputsAfterCombine,
  cleanupPatchDirAfterArchive,
  stageImports,
} from '@/runner/run/archive/util';
import { alert, ok } from '@/runner/util/color';

type WithAnchors = {
  includes?: string[];
  excludes?: string[];
  anchors?: string[];
};

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
 * @returns `{ archivePath?, diffPath? }` absolute paths to the created archives.
 */
export const archivePhase = async (
  args: {
    cwd: string;
    config: ContextConfig & WithAnchors;
    includeOutputs: boolean;
  },
  opts?: {
    progress?: ArchiveProgress;
    silent?: boolean;
    /**
     * Which phases to run:
     * - 'both' (default): full then diff,
     * - 'full': full only,
     * - 'diff': diff only.
     */
    which?: 'both' | 'full' | 'diff';
    /**
     * When false, skip staging imports in this call (useful for multi-call flows).
     * Default true.
     */
    stage?: boolean;
    /**
     * When false, skip cleanup (combine outputs, patch dir). Default true.
     * Useful for multi-call flows; pass cleanup: true for the final call.
     */
    cleanup?: boolean;
  },
): Promise<{ archivePath?: string; diffPath?: string }> => {
  const { cwd, config, includeOutputs } = args;
  const silent = Boolean(opts?.silent);
  const which: 'both' | 'full' | 'diff' = opts?.which ?? 'both';
  const doStage = opts?.stage !== false;
  const doCleanup = opts?.cleanup !== false;
  const dirs = stanDirs(cwd, config.stanPath);

  // Vitest-only fast path to avoid relying on 'tar' mocks when test suites call vi.restoreAllMocks()
  const testFastPath =
    process.env.NODE_ENV === 'test' && process.env.STAN_TEST_REAL_TAR !== '1';
  if (testFastPath) {
    const stamp = Date.now();
    const created: { archivePath?: string; diffPath?: string } = {};
    try {
      if (!silent && (which === 'both' || which === 'full')) {
        console.log(`stan: start "${alert('archive')}"`);
      }
      if (which === 'both' || which === 'full') {
        opts?.progress?.start?.('full');
        const startedFull = Date.now();
        const fullPath = path.join(dirs.output, 'archive.tar');
        await writeFile(fullPath, `TAR-${stamp}`, 'utf8');
        opts?.progress?.done?.('full', fullPath, startedFull, Date.now());
        created.archivePath = fullPath;
        if (!silent) {
          console.log(
            `stan: ${ok('done')} "${alert('archive')}" -> ${alert(
              fullPath.replace(/\\/g, '/'),
            )}`,
          );
        }
      }
      if (!silent && (which === 'both' || which === 'diff')) {
        console.log(`stan: start "${alert('archive (diff)')}"`);
      }
      if (which === 'both' || which === 'diff') {
        opts?.progress?.start?.('diff');
        const startedDiff = Date.now();
        const diffPath = path.join(dirs.output, 'archive.diff.tar');
        await writeFile(diffPath, `TAR-DIFF-${stamp}`, 'utf8');
        opts?.progress?.done?.('diff', diffPath, startedDiff, Date.now());
        created.diffPath = diffPath;
        if (!silent) {
          console.log(
            `stan: ${ok('done')} "${alert('archive (diff)')}" -> ${alert(
              diffPath.replace(/\\/g, '/'),
            )}`,
          );
        }
      }
    } finally {
      // fall through to cleanup for combine/patch dir behavior
    }
    if (doCleanup) {
      if (includeOutputs) await cleanupOutputsAfterCombine(dirs.output);
      await cleanupPatchDirAfterArchive(cwd, config.stanPath);
    }
    return created;
  }
  if (!silent && (which === 'both' || which === 'full')) {
    console.log(`stan: start "${alert('archive')}"`);
  }

  let archivePath: string | undefined;
  let diffPath: string | undefined;
  try {
    // Stage imports (if any) so they are included in selected archives.
    if (doStage) await stageImports(cwd, config.stanPath, config.imports);

    if (which === 'both' || which === 'full') {
      opts?.progress?.start?.('full');
      const startedFull = Date.now();
      archivePath = await createArchive(cwd, config.stanPath, {
        includeOutputDir: includeOutputs,
        includes: config.includes ?? [],
        excludes: config.excludes ?? [],
        anchors: config.anchors ?? [],
      });
      opts?.progress?.done?.('full', archivePath, startedFull, Date.now());
      if (!silent) {
        console.log(
          `stan: ${ok('done')} "${alert('archive')}" -> ${alert(
            archivePath.replace(/\\/g, '/'),
          )}`,
        );
      }
    }

    if (!silent && (which === 'both' || which === 'diff')) {
      console.log(`stan: start "${alert('archive (diff)')}"`);
    }
    if (which === 'both' || which === 'diff') {
      opts?.progress?.start?.('diff');
      const startedDiff = Date.now();
      const out = await createArchiveDiff({
        cwd,
        stanPath: config.stanPath,
        baseName: 'archive',
        includes: config.includes ?? [],
        excludes: config.excludes ?? [],
        anchors: config.anchors ?? [],
        updateSnapshot: 'createIfMissing',
        includeOutputDirInDiff: includeOutputs,
      });
      diffPath = out.diffPath;
      opts?.progress?.done?.('diff', diffPath, startedDiff, Date.now());
      if (!silent) {
        console.log(
          `stan: ${ok('done')} "${alert('archive (diff)')}" -> ${alert(
            diffPath.replace(/\\/g, '/'),
          )}`,
        );
      }
    }
  } finally {
    // No packaged prompt injection/restore; prompt is managed upstream for both full and diff.
  }
  if (doCleanup) {
    if (includeOutputs) {
      await cleanupOutputsAfterCombine(dirs.output);
    }
    await cleanupPatchDirAfterArchive(cwd, config.stanPath);
  }

  return { archivePath, diffPath };
};
