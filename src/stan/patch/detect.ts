/* src/stan/patch/detect.ts
 * Early-input detection helpers for patch service.
 */
/**
 * Heuristic check whether the text appears to be a plain unified diff.
 * Looks for git-style or minimal unified-diff headers and hunk markers.
 *
 * @param t - Input text to test.
 * @returns True if the content resembles a unified diff.
 */
export const seemsUnifiedDiff = (t: string): boolean =>
  /^diff --git /m.test(t) ||
  (/^---\s+(?:a\/|\S)/m.test(t) &&
    /^\+\+\+\s+(?:b\/|\S)/m.test(t) &&
    /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/m.test(t));
