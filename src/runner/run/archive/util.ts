// src/stan/run/archive/util.ts
import { readdir, rm } from 'node:fs/promises';
import path, { resolve as resolvePath } from 'node:path';

import { prepareImports } from '@karmaniverous/stan-core';

/**
 * Stage imports under <stanPath>/imports so both full and diff archives see the same
 * staged context.
 *
 * Behavior:
 * - Always clear the entire <stanPath>/imports directory first (best‑effort).
 * - Then, if a map is provided, call core.prepareImports to stage the current labels.
 *
 * Notes:
 * - Core's prepareImports also clears each label directory; we keep that as a
 *   belt‑and‑suspenders for non‑CLI callers while the CLI clears the root up front
 *   to remove labels that were dropped from config.
 * - All operations are best‑effort and swallow errors to avoid impacting the run.
 */
export const stageImports = async (
  cwd: string,
  stanPath: string,
  imports?: Record<string, string[]> | null,
): Promise<void> => {
  // 1) Clear the entire imports root first (best‑effort).
  const importsAbs = path.join(cwd, stanPath, 'imports');
  try {
    const entries = await readdir(importsAbs, { withFileTypes: true });
    await Promise.all(
      entries.map((e) =>
        rm(resolvePath(importsAbs, e.name), { recursive: true, force: true }),
      ),
    );
  } catch {
    // best‑effort; root may not exist yet.
  }

  // 2) Stage current map (if any).
  if (imports && typeof imports === 'object') {
    try {
      await prepareImports({ cwd, stanPath, map: imports });
    } catch {
      // best‑effort; continue without imports
    }
  }
};

/**
 * Remove on‑disk script outputs after combine mode archived them.
 * Keeps `archive.tar` and `archive.diff.tar` in place.
 * @param outAbs - Absolute path to `<stanPath>/output`.
 */
export const cleanupOutputsAfterCombine = async (
  outAbs: string,
): Promise<void> => {
  try {
    const entries = await readdir(outAbs, { withFileTypes: true });
    const keepNames = new Set(['archive.tar', 'archive.diff.tar']);
    await Promise.all(
      entries.map(async (e) => {
        if (keepNames.has(e.name)) return;
        await rm(resolvePath(outAbs, e.name), { recursive: true, force: true });
      }),
    );
  } catch {
    // best‑effort
  }
};

/**
 * Clear `<stanPath>/patch` contents after archiving (preserve the directory).
 *
 * Removes files under the patch workspace so subsequent archives include
 * a clean patch directory while preserving the directory itself.
 */
export const cleanupPatchDirAfterArchive = async (
  cwd: string,
  stanPath: string,
): Promise<void> => {
  const patchAbs = path.join(cwd, stanPath, 'patch');
  try {
    const entries = await readdir(patchAbs, { withFileTypes: true });
    await Promise.all(
      entries.map((e) =>
        rm(resolvePath(patchAbs, e.name), { recursive: true, force: true }),
      ),
    );
  } catch {
    // best‑effort
  }
};
