/* src/stan/init/gitignore.ts */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Ensure standard `.gitignore` entries for the STAN workspace.
 *
 * Adds the `output/`, `diff/`, `dist/`, and `patch/` subpaths under the resolved
 * `stanPath` if they are not already present. Creates `.gitignore` when missing.
 *
 * @param cwd - Repository root directory.
 * @param stanPath - STAN workspace folder (for example, ".stan").
 * @returns Promise that resolves when `.gitignore` is updated or already correct.
 */
export const ensureStanGitignore = async (
  cwd: string,
  stanPath: string,
): Promise<void> => {
  const giPath = path.join(cwd, '.gitignore');
  const rel = (sub: string) => path.join(stanPath, sub).replace(/\\/g, '/');
  const linesToEnsure = [
    `${rel('output')}/`,
    `${rel('diff')}/`,
    `${rel('dist')}/`,
    `${rel('patch')}/`,
    `${rel('imports')}/`,
    `${rel('context')}/`,
    // System files: ephemeral state/metadata should never be committed.
    // Keep these gitignored explicitly (and add deterministically if absent).
    rel('system/.docs.meta.json'),
  ];

  let gi = existsSync(giPath) ? await readFile(giPath, 'utf8') : '';
  const existing = new Set(gi.split(/\r?\n/).map((l) => l.trim()));
  let changed = false;
  for (const l of linesToEnsure) {
    if (!existing.has(l)) {
      if (gi.length && !gi.endsWith('\n')) gi += '\n';
      gi += `${l}\n`;
      changed = true;
    }
  }
  if (changed) await writeFile(giPath, gi, 'utf8');
};
