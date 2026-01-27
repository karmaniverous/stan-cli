/**
 * Shared collection helpers for CLI parsing.
 */

/** Coerce nested unknown to a string list (preserving order; dropping non-strings). */
export const toStringArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : typeof v === 'string'
      ? [v]
      : [];

/** Preserve-order stable dedupe for string arrays. */
export const dedupePreserve = (list: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of list) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
};
