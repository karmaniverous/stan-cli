/** src/cli/patch/detect.ts
 * Minimal unified‑diff detector and first-target parser (pure).
 */

/** True when the payload looks like a unified diff (git‑style headers). */
export const looksLikeUnifiedDiff = (raw: string): boolean => {
  const s = raw.trimStart();
  return (
    s.startsWith('diff --git ') ||
    s.includes('\n--- ') ||
    s.includes('\n+++ ') ||
    /^---\s+(?:a\/|\/dev\/null)/m.test(s)
  );
};

/** Extract the first target path from a cleaned unified diff. */
export const parseFirstTarget = (cleaned: string): string | undefined => {
  // Prefer +++ b/<path>; fall back to "diff --git a/X b/Y" => Y
  const plus = cleaned.match(/^\+\+\+\s+b\/([^\r\n]+)$/m);
  if (plus && plus[1]) return plus[1];
  const hdr = cleaned.match(/^diff --git\s+a\/([^\s]+)\s+b\/([^\s]+)$/m);
  if (hdr && hdr[2]) return hdr[2];
  return undefined;
};
