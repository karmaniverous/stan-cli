/* src/stan/run/exec/env.ts
 * Child process environment preparation (PATH augmentation for repo-local .bin).
 */
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

/** Compute nearest-first chain of node_modules/.bin directories up to filesystem root. */
export const computeBinPathChain = (repoRoot: string): string[] => {
  const bins: string[] = [];
  let cur = repoRoot;
  for (;;) {
    const bin = join(cur, 'node_modules', '.bin');
    try {
      if (existsSync(bin)) bins.push(bin);
    } catch {
      /* ignore */
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return bins;
};

/** Build child env with PATH prefixed by nearest-first node_modules/.bin chain. */
export const buildChildEnv = (
  cwd: string,
  parentEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => {
  const origPath =
    parentEnv.PATH ??
    // Windows may expose PATH as "Path"
    (parentEnv as unknown as { Path?: string }).Path ??
    '';
  const binChain = computeBinPathChain(cwd);
  return {
    ...parentEnv,
    PATH: [...binChain, origPath].filter(Boolean).join(delimiter),
  };
};
