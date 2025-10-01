/* src/stan/config/output.ts
 * Ensure STAN workspace subdirectories and manage output/diff.
 */
import { existsSync, rmSync } from 'node:fs';
import { copyFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ARCHIVE_PREV_TAR, ARCHIVE_TAR } from '@/stan/archive/constants';
import { ensureStanWorkspace } from '@/stan/fs';
import { makeStanDirs } from '@/stan/paths';

/**
 * Ensure the STAN workspace exists and manage output/diff.
 *
 * Behavior:
 * - Always ensure `stanPath/output` and `stanPath/diff` exist.
 * - Also ensure `stanPath/patch` exists so archives can include it.
 * - When `keep === false`, copy `output/archive.tar` to `diff/archive.prev.tar`
 *   if present, then clear only the `output` directory.
 *
 * @param cwd - Repo root.
 * @param stanPath - Workspace folder (e.g., `.stan`).
 * @param keep - When `true`, do not clear the output directory.
 * @returns Absolute path to the workspace root (`stanPath`).
 */
export const ensureOutputDir = async (
  cwd: string,
  stanPath: string,
  keep = false,
): Promise<string> => {
  const dirs = makeStanDirs(cwd, stanPath);
  // Bootstrap workspace tree (root/output/diff/patch)
  await ensureStanWorkspace(cwd, stanPath);

  if (!keep) {
    const archiveTar = resolve(dirs.outputAbs, ARCHIVE_TAR);
    if (existsSync(archiveTar)) {
      try {
        await copyFile(archiveTar, resolve(dirs.diffAbs, ARCHIVE_PREV_TAR));
      } catch {
        // ignore copy errors
      }
    }

    const entries = await readdir(dirs.outputAbs, { withFileTypes: true });
    for (const e of entries) {
      rmSync(resolve(dirs.outputAbs, e.name), { recursive: true, force: true });
    }
  }

  return dirs.rootAbs;
};
