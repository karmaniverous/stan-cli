const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

const stripZeroWidthAndNormalize = (s: string): string => {
  const noZW = s.replace(ZERO_WIDTH_RE, '');
  const lf = noZW.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return lf.endsWith('\n') ? lf : lf + '\n';
};

const ensureFinalNewline = (s: string): string =>
  s.endsWith('\n') ? s : s + '\n';

const looksLikeUnifiedDiff = (t: string): boolean => {
  if (/^diff --git /m.test(t)) return true;
  if (/^---\s+(?:a\/|\S)/m.test(t) && /^\+\+\+\s+(?:b\/|\S)/m.test(t))
    return true;
  if (/^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/m.test(t)) return true;
  return false;
};

const unwrapChatWrappers = (text: string): string => {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  let j = lines.length - 1;
  while (j >= 0 && lines[j].trim() === '') j -= 1;
  if (i > j) return text;

  const first = lines[i].trim();
  const last = lines[j].trim();
  const isFence = (s: string) => /^```/.test(s);
  const isBegin = (s: string) => /^BEGIN[_ -]?PATCH/i.test(s);
  const isEnd = (s: string) => /^END[_ -]?PATCH/i.test(s);
  // Common non‑unified wrappers (e.g., "*** Begin Patch" / "*** End Patch")
  const isStarBegin = (s: string) =>
    /^\*{3,}\s*BEGIN\s+PATCH/i.test(s) || /^\*{3,}\s*Begin\s+Patch/i.test(s);
  const isStarEnd = (s: string) =>
    /^\*{3,}\s*END\s+PATCH/i.test(s) || /^\*{3,}\s*End\s+Patch/i.test(s);

  const unwrapIf = (cond: boolean): string => {
    if (!cond) return text;
    const inner = lines.slice(i + 1, j);
    return [...lines.slice(0, i), ...inner, ...lines.slice(j + 1)].join('\n');
  };

  if (isFence(first) && isFence(last)) return unwrapIf(true);
  if (isBegin(first) && isEnd(last)) return unwrapIf(true);
  if (isStarBegin(first) && isStarEnd(last)) return unwrapIf(true);
  return text;
};
const extractFencedUnifiedDiff = (text: string): string | null => {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const open = lines[i];
    const m = open.match(/^`{3,}.*$/);
    if (!m) continue;
    const tickCount = (open.match(/^`+/) ?? [''])[0].length;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (new RegExp(`^\\\`${'{'}${tickCount}{'}'}\\s*$`).test(lines[j])) {
        const inner = lines.slice(i + 1, j).join('\n');
        if (looksLikeUnifiedDiff(inner)) return inner;
        i = j;
        break;
      }
    }
  }
  return null;
};

const extractRawUnifiedDiff = (text: string): string | null => {
  let idx = text.search(/^diff --git /m);
  if (idx < 0) idx = text.search(/^---\s+(?:a\/|\S)/m);
  if (idx < 0) return null;
  const body = text.slice(idx);
  const trimmed = body.replace(/\n`{3,}\s*$/m, '\n');
  return trimmed;
};

/**
 * Detect and clean a patch payload from clipboard/file/argument.
 * - Unwraps chat fences and BEGIN/END PATCH banners when they wrap the entire payload.
 * - Extracts the first unified diff (fenced or raw).
 * - Normalizes EOL to LF, strips zero-width, and ensures a trailing newline.
 */
export const detectAndCleanPatch = (input: string): string => {
  const pre = stripZeroWidthAndNormalize(input.trim());
  const maybeUnwrapped = unwrapChatWrappers(pre);
  const normalized = stripZeroWidthAndNormalize(maybeUnwrapped);

  const fenced = extractFencedUnifiedDiff(normalized);
  if (fenced)
    return ensureFinalNewline(stripZeroWidthAndNormalize(fenced).trimEnd());

  const raw = extractRawUnifiedDiff(normalized);
  if (raw) return ensureFinalNewline(stripZeroWidthAndNormalize(raw).trimEnd());

  return ensureFinalNewline(normalized);
};
