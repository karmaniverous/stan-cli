// src/runner/run/archive/printable.ts
/**
 * Printable label for archive rows.
 * - 'full' -> 'archive'
 * - 'diff' -> 'archive (diff)'
 */
export const archivePrintable = (kind: 'full' | 'diff'): string => {
  return kind === 'diff' ? 'archive (diff)' : 'archive';
};
