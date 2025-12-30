// src/runner/selection/implicit-imports.ts
/**
 * Implicit selection helpers for STAN's staged imports.
 *
 * Policy:
 * - <stanPath>/imports/ is gitignored by default (stan init).
 * - The CLI must still include <stanPath>/imports/** automatically in:
 *   - snapshot baselines (stan init / stan snap),
 *   - archive creation (full + diff),
 *   so that changes to staged imports show up in archive.diff.tar without
 *   requiring users to declare includes in config.
 *
 * Option A semantics:
 * - Implemented as an additive include pattern.
 * - Users can still opt out by explicitly excluding <stanPath>/imports/**.
 */

const posix = (p: string): string => p.replace(/\\+/g, '/');

const normalizeStanPath = (stanPath: string): string => {
  const raw = typeof stanPath === 'string' ? stanPath.trim() : '';
  const cleaned = posix(raw).replace(/\/+$/, '');
  if (cleaned.length > 0) {
    return cleaned;
  }
  if (raw.startsWith('/')) {
    return ''; // Handle root path
  }
  return '.stan'; // Default for empty/whitespace
};

export const implicitImportsInclude = (stanPath: string): string => {
  const sp = normalizeStanPath(stanPath);
  return `${sp}/imports/**`;
};

/**
 * Append the implicit imports include (if missing) while preserving order.
 */
export const withImplicitImportsInclude = (
  stanPath: string,
  includes?: string[] | null,
): string[] => {
  const base = Array.isArray(includes)
    ? includes.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : [];
  const pattern = implicitImportsInclude(stanPath);
  return base.includes(pattern) ? base : [...base, pattern];
};
