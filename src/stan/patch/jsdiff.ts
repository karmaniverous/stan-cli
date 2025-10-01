// src/stan/patch/jsdiff.ts
/* src/stan/patch/jsdiff.ts
 * Apply a unified diff with the "diff" library as a fallback engine.
 * - Deterministic path resolution from patch headers (no fuzzy/basename matching).
 * - Whitespace/EOL-tolerant comparison (ignores CR and trailing whitespace).
 * - Preserves original EOL flavor (CRLF vs LF) per file.
 * - When check=true, writes patched content to a sandbox under <stanPath>/patch/.sandbox/<ts>/ without touching repo files.
 * - When writing to the repo (check=false), ensure parent directories exist for new or nested paths.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { applyPatch, parsePatch } from 'diff';

const stripAB = (p?: string | null): string | null => {
  if (!p) return null;
  const s = p.replace(/^a\//, '').replace(/^b\//, '').trim();
  // diff lib sometimes prefixes a/ or b/ on both fields; return normalized path
  return s.length ? s : null;
};

const isDevNull = (p?: string | null): boolean =>
  typeof p === 'string' && p.trim() === '/dev/null';

const normForCompare = (s: string): string =>
  s.replace(/\r/g, '').replace(/[ \t]+$/g, '');

const toCRLF = (s: string): string => s.replace(/\n/g, '\r\n');

export type JsDiffOutcome = {
  okFiles: string[];
  failed: Array<{ path: string; reason: string }>;
  sandboxRoot?: string;
};

/** Apply cleaned unified diff text using jsdiff as a fallback engine. */
export const applyWithJsDiff = async (args: {
  cwd: string;
  cleaned: string;
  check: boolean;
  sandboxRoot?: string;
}): Promise<JsDiffOutcome> => {
  const { cwd, cleaned, check, sandboxRoot } = args;

  let patches: ReturnType<typeof parsePatch>;
  try {
    patches = parsePatch(cleaned);
  } catch {
    // Gracefully handle invalid or non-unified diffs — never throw
    return {
      okFiles: [],
      failed: [{ path: '(patch)', reason: 'invalid unified diff' }],
      sandboxRoot,
    };
  }
  // Treat empty or nameless parsed results as invalid unified diffs.
  const hasNamed = patches.some((p) => {
    const a = stripAB(p.oldFileName);
    const b = stripAB(p.newFileName);
    return Boolean((a && a.length) || (b && b.length));
  });
  if (!patches.length || !hasNamed) {
    return {
      okFiles: [],
      failed: [{ path: '(patch)', reason: 'invalid unified diff' }],
      sandboxRoot,
    };
  }

  const okFiles: string[] = [];
  const failed: Array<{ path: string; reason: string }> = [];

  for (const p of patches) {
    const candidate = stripAB(p.newFileName) ?? stripAB(p.oldFileName);
    if (!candidate) {
      failed.push({
        path: '(unknown)',
        reason: 'no file name in patch header',
      });
      continue;
    }
    const rel = candidate.replace(/^[./]+/, '');
    const abs = path.resolve(cwd, rel);

    const isMd = /\.md$/i.test(rel);
    let original = '';
    let eolCRLF = false;
    let existed = true;
    try {
      const raw = await readFile(abs, 'utf8');
      original = raw;
      eolCRLF = /\r\n/.test(raw);
    } catch {
      existed = false;
    }
    // Support new-file creation: when old side is /dev/null, treat original as empty.
    const creatingNewFile = isDevNull(p.oldFileName);
    if (!existed && !creatingNewFile) {
      failed.push({ path: rel, reason: 'target file not found' });
      continue;
    }
    if (!existed && creatingNewFile) {
      original = '';
      eolCRLF = false; // default LF for brand-new content; CRLF restored only when original was CRLF
    }

    // Whitespace/EOL tolerance for diff v8 API (compareLine signature changed)
    let patched: string | false;
    try {
      patched = applyPatch(original, p, {
        compareLine: (
          _lineNumber: number,
          line: string,
          _operation: string,
          patchContent: string,
        ): boolean => normForCompare(line) === normForCompare(patchContent),
        fuzzFactor: isMd ? 1 : 0,
      });
    } catch {
      // Any internal jsdiff error is treated as a placement failure
      failed.push({ path: rel, reason: 'unable to parse or place hunk(s)' });
      continue;
    }

    if (patched === false || typeof patched !== 'string') {
      failed.push({ path: rel, reason: 'unable to place hunk(s)' });
      continue;
    }

    const finalBody = eolCRLF
      ? toCRLF(patched.replace(/\r/g, ''))
      : patched.replace(/\r/g, '');

    try {
      if (check) {
        const root =
          sandboxRoot ?? path.join(cwd, '.stan', 'patch', '.sandbox');
        const dest = path.resolve(root, rel);
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, finalBody, 'utf8');
      } else {
        // Ensure the parent directory exists for new files or nested paths.
        // This makes jsdiff fallback robust when creating files under e.g. "src/rrstack/describe/...".
        // (git apply can fail on /dev/null patches; jsdiff must not.)
        try {
          await mkdir(path.dirname(abs), { recursive: true });
        } catch {
          /* best-effort */
        }
        await writeFile(abs, finalBody, 'utf8');
      }
      okFiles.push(rel);
    } catch {
      failed.push({ path: rel, reason: 'write failed' });
    }
  }

  return { okFiles, failed, sandboxRoot };
};
