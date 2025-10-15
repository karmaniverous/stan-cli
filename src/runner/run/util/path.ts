// src/stan/run/util/path.ts
import path from 'node:path';

/** Normalize slashes to POSIX. */
export const normalizeSlashes = (p: string): string => p.replace(/\\/g, '/');

/**
 * Repo‑relative, normalized output path for display.
 * - If `absOrRel` is absolute, return `relative(cwd, absOrRel)` (POSIX).
 * - If it is already relative, return it with normalized slashes.
 * - Falsy input -\> ''.
 */
export const relOut = (cwd: string, absOrRel?: string): string => {
  if (!absOrRel) return '';
  const maybeAbs = absOrRel;
  if (path.isAbsolute(maybeAbs)) {
    return normalizeSlashes(path.relative(cwd, maybeAbs));
  }
  return normalizeSlashes(maybeAbs);
};
