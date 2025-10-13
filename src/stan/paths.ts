// src/stan/paths.ts
import path from 'node:path';

export type StanDirs = {
  /** <cwd>/<stanPath> */
  base: string;
  /** <cwd>/<stanPath>/system */
  system: string;
  /** <cwd>/<stanPath>/output */
  output: string;
  /** <cwd>/<stanPath>/diff */
  diff: string;
  /** <cwd>/<stanPath>/patch */
  patch: string;
  /** <cwd>/<stanPath>/system/stan.system.md */
  systemFile: string;
};

/** Compute common STAN workspace paths (POSIX-insensitive). */
export const stanDirs = (cwd: string, stanPath: string): StanDirs => {
  const base = path.join(cwd, stanPath);
  const system = path.join(base, 'system');
  const output = path.join(base, 'output');
  const diff = path.join(base, 'diff');
  const patch = path.join(base, 'patch');
  const systemFile = path.join(system, 'stan.system.md');
  return { base, system, output, diff, patch, systemFile };
};
