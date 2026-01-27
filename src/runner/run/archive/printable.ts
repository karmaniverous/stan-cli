/**
 * Printable label for archive rows.
 * - 'full' -\> 'archive'
 * - 'diff' -\> 'archive (diff)'
 * - 'meta' -\> 'archive (meta)'
 * @module
 */
export const archivePrintable = (kind: 'full' | 'diff' | 'meta'): string => {
  if (kind === 'diff') return 'archive (diff)';
  if (kind === 'meta') return 'archive (meta)';
  return 'archive';
};
