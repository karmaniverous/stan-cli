import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path, { resolve } from 'node:path';

import { alert, ok } from '@/stan/util/color';

import { createArchive } from '../archive';
import type { ContextConfig } from '../config';
import { createArchiveDiff } from '../diff';
import { prepareImports } from '../imports/stage';
import { getPackagedSystemPromptPath } from '../module';
import { makeStanDirs } from '../paths';
import { assembleSystemMonolith } from '../system/assemble';
import { getVersionInfo } from '../version';
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

/**
 * Resolve the packaged system monolith (dist/stan.system.md) from this module.
 */
const resolvePackagedSystemMonolith = (): string | null => {
  return getPackagedSystemPromptPath();
};

/**
 * Write the packaged system prompt to `<stanPath>/system/stan.system.md` for
 * the duration of archiving and return a cleanup function that restores previous
 * state (or removes the file if it did not exist).
 *
 * Used for downstream repos so the full archive always contains a baseline
 * system prompt even when local prompts are managed from the package.
 *
 * @param cwd - Repository root.
 * @param stanPath - STAN workspace folder (for example, ".stan").
 * @returns Async cleanup function to restore the original file state.
 */
const preparePackagedSystemPrompt = async (
  cwd: string,
  stanPath: string,
): Promise<() => Promise<void>> => {
  const packaged = resolvePackagedSystemMonolith();
  if (!packaged) return async () => {};

  const sysDir = path.resolve(cwd, stanPath, 'system');
  await mkdir(sysDir, { recursive: true });
  const dest = path.join(sysDir, 'stan.system.md');

  const existed = existsSync(dest);
  let original: string | null = null;
  if (existed) {
    try {
      original = await readFile(dest, 'utf8');
    } catch {
      original = null;
    }
  }
  const body = await readFile(packaged, 'utf8');
  await writeFile(dest, body, 'utf8');

  return async () => {
    try {
      if (existed) {
        if (original !== null) await writeFile(dest, original, 'utf8');
      } else {
        await rm(dest, { force: true });
      }
    } catch {
      // best-effort
    }
  };
};

/**
 * Dev‑only: assemble `.stan/system/parts/*.md` into `stan.system.md` before
 * archiving. No‑ops when the parts directory is missing or empty.
 *
 * This keeps archives reproducible while authoring the prompt as parts
 * in the STAN development repository.
 *
 * @param cwd - Repository root.
 * @param stanPath - STAN workspace folder.
 */
const assembleSystemFromParts = async (
  cwd: string,
  stanPath: string,
): Promise<void> => {
  try {
    await assembleSystemMonolith(cwd, stanPath);
  } catch {
    // best-effort
  }
};

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
  const dirs = makeStanDirs(cwd, stanPath);
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
 * - In the STAN dev repo, assembles the system monolith from parts before
 *   archiving.
 * - In downstream repos, temporarily writes the packaged baseline system
 *   prompt for inclusion in the full archive and restores it afterwards.
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
  const dirs = makeStanDirs(cwd, config.stanPath);

  if (!silent) {
    console.log(`stan: start "${alert('archive')}"`);
  }
  // In this repo, assemble the system monolith from parts before archiving.
  const vinfo = await getVersionInfo(cwd);
  let restore: () => Promise<void> = async () => {};
  if (vinfo.isDevModuleRepo) {
    try {
      await assembleSystemFromParts(cwd, config.stanPath);
    } catch {
      // best-effort
    }
  } else {
    // Ensure the packaged system prompt is present during archiving (full archive).
    restore = await preparePackagedSystemPrompt(cwd, config.stanPath);
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
          map: config.imports as Record<string, string[]>,
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
    // Important: restore any ephemeral packaged system prompt before computing the diff.
    // Otherwise, downstream repos (which do not maintain a local stan.system.md)
    // will see it as a spurious change on every run because the snapshot won’t include it.
    await restore();
    // Prevent double-restore in the outer finally.
    restore = async () => {};

    if (!silent) {
      console.log(`stan: start "${alert('archive (diff)')}"`);
    }
    opts?.progress?.start?.('diff');
    const startedDiff = Date.now();
    // We intentionally do not force-include the system prompt in the diff archive.
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
    // No-op if already restored; otherwise remove/restore ephemeral system prompt (downstream only).
    await restore();
  }
  if (includeOutputs) {
    await cleanupOutputsAfterCombine(dirs.outputAbs);
  }
  await cleanupPatchDirAfterArchive(cwd, config.stanPath);

  return { archivePath, diffPath };
};
