/* src/stan/fs/reserved.ts
 * Helpers for reserved workspace paths under <stanPath>.
 */
import {
  ARCHIVE_DIFF_TAR,
  ARCHIVE_TAR,
  ARCHIVE_WARNINGS,
} from '@/stan/archive/constants';

const norm = (s: string): string => s.replace(/\\/g, '/');
const under = (prefix: string, p: string): boolean => {
  const a = norm(prefix).replace(/\/+$/, '');
  const b = norm(p);
  return b === a || b.startsWith(`${a}/`);
};

/** Reserved workspace subpaths never included in archives by policy. */
export const isReservedWorkspacePath = (
  stanPath: string,
  p: string,
): boolean => {
  const base = norm(stanPath);
  return under(`${base}/diff`, p) || under(`${base}/patch`, p);
};

/** Reserved archive file names under <stanPath>/output. */
export const isOutputArchivePath = (stanPath: string, p: string): boolean => {
  const base = norm(stanPath);
  return (
    norm(p) === `${base}/output/${ARCHIVE_TAR}` ||
    norm(p) === `${base}/output/${ARCHIVE_DIFF_TAR}` ||
    norm(p) === `${base}/output/${ARCHIVE_WARNINGS}`
  );
};

// re-export utility for callers that need a prefix check
export const isUnder = under;
