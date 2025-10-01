/* src/stan/config/discover.ts
 * Locate the nearest stan.config.* starting from a cwd.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { packageDirectorySync } from 'package-directory';

const configCandidates = [
  'stan.config.yml',
  'stan.config.yaml',
  'stan.config.json',
];

const tryConfigHere = (dir: string): string | null => {
  for (const name of configCandidates) {
    const p = resolve(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
};

/**
 * Resolve the absolute path to the nearest `stan.config.*` starting from `cwd`.
 *
 * @param cwd - Directory to start searching from.
 * @returns Absolute path to the config file, or `null` if none found.
 */
export const findConfigPathSync = (cwd: string): string | null => {
  // direct in cwd
  const direct = tryConfigHere(cwd);
  if (direct) return direct;

  // ascend package roots
  const seen = new Set<string>();
  let cursor: string | null = cwd;
  while (cursor) {
    const pkgRoot = packageDirectorySync({ cwd: cursor });
    if (!pkgRoot || seen.has(pkgRoot)) break;
    seen.add(pkgRoot);
    const found = tryConfigHere(pkgRoot);
    if (found) return found;
    const parent = dirname(pkgRoot);
    if (parent === pkgRoot || seen.has(parent)) break;
    cursor = parent;
  }
  return null;
};
