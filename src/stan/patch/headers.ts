/* src/stan/patch/headers.ts
 * Extract header-derived candidate paths from unified diff.
 */
/**
 * Extract unique repo‑relative file paths from unified diff headers.
 *
 * @param cleaned - Unified diff text (already cleaned).
 * @returns An array of unique file paths referenced by `diff --git` headers.
 */
export const pathsFromPatch = (cleaned: string): string[] => {
  const out: string[] = [];
  const re = /^diff --git a\/(.+?) b\/\1/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const p = m[1]?.trim();
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
};
