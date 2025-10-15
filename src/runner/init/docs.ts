// src/stan/init/docs.ts
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureDir } from 'fs-extra';
import { packageDirectorySync } from 'package-directory';
/**
 * Ensure <stanPath>/system contains the shipped docs and record package version * to <stanPath>/system/.docs.meta.json.
 *
 * @param cwd - Repository root.
 * @param stanPath - STAN workspace folder (for example, ".stan").
 * @returns Promise that resolves when the docs and metadata have been ensured.
 */
export const ensureDocs = async (
  cwd: string,
  stanPath: string,
): Promise<void> => {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  // Resolve this module's package root (no core dependency).
  const moduleRoot = packageDirectorySync({ cwd: thisDir }) ?? thisDir;

  // Ensure the <stanPath>/system directory exists for metadata
  const systemDir = path.join(cwd, stanPath, 'system');
  await ensureDir(systemDir);

  // No prompt templates are installed by init.
  // We only record the currently installed package version as docs metadata.
  // Write docs meta { version } best-effort
  try {
    const pkgPath = path.join(moduleRoot, 'package.json');
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    const version =
      typeof pkg?.version === 'string' && pkg.version.length > 0
        ? pkg.version
        : undefined;
    if (version) {
      const metaPath = path.join(systemDir, '.docs.meta.json');
      await writeFile(metaPath, JSON.stringify({ version }, null, 2), 'utf8');
    }
  } catch {
    // best-effort
  }
};
