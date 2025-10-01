/** src/stan/validate/response.ts
 * Response-format validator for assistant replies.
 *
 * Also validates optional "### File Ops" pre-ops block (verbs/arity/path rules).
 *
 * Checks (initial):
 * - One Patch per file.
 * - Each Patch block contains exactly one "diff --git a/<path> b/<path>" header.
 * - When both are present for a given file, "Patch" precedes "Full Listing".
 * - "## Commit Message" exists and is the final section.
 * - If any non‑docs Patch exists, there is also a Patch for ".stan/system/stan.todo.md".
 */
/**
 * Kind tag for validator blocks. Exported so it appears in generated
 * documentation and to eliminate TypeDoc’s “referenced but not documented” warning.
 */
export type BlockKind = 'patch' | 'full' | 'commit';

export type Block = {
  kind: BlockKind;
  /** Repo-relative target path for patch/listing blocks; undefined for commit. */ path?: string;
  /** Start index (character offset) in the source for ordering checks. */
  start: number;
  /** Block body (content between its heading and the next heading). */
  body: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const toPosix = (p: string): string => p.replace(/\\/g, '/');

const H_PATCH = /^###\s+Patch:\s+(.+?)\s*$/m;
const H_FULL = /^###\s+Full Listing:\s+(.+?)\s*$/m;
const H_COMMIT = /^##\s+Commit Message\s*$/m;
const H_ANY = /^##\s+.*$|^###\s+.*$/m;
// File Ops heading and helpers
const H_FILE_OPS = /^###\s+File Ops\s*$/m;
const isAbsolutePosix = (p: string): boolean => /^[/\\]/.test(p);
const normalizePosix = (p: string): string => {
  const norm = (toPosix(p) || '').split('/').filter(Boolean).join('/');
  return norm.replace(/\/+$/, '');
};

/** Find all headings and slice blocks up to the next heading or end. */
const extractBlocks = (text: string): Block[] => {
  const blocks: Block[] = [];
  const indices: number[] = [];
  // Collect all heading start indices (## or ###)
  {
    const re = new RegExp(H_ANY.source, 'gm');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) indices.push(m.index);
  }
  // Append sentinel end
  indices.push(text.length);
  // Walk each heading
  for (let i = 0; i < indices.length - 1; i += 1) {
    const start = indices[i];
    const end = indices[i + 1];
    const chunk = text.slice(start, end);
    // Classify
    if (H_COMMIT.test(chunk)) {
      // Commit block
      blocks.push({ kind: 'commit', start, body: chunk });
      continue;
    }
    const mPatch = chunk.match(H_PATCH);
    if (mPatch && mPatch[1]) {
      blocks.push({
        kind: 'patch',
        path: toPosix(mPatch[1].trim()),
        start,
        body: chunk,
      });
      continue;
    }
    const mFull = chunk.match(H_FULL);
    if (mFull && mFull[1]) {
      blocks.push({
        kind: 'full',
        path: toPosix(mFull[1].trim()),
        start,
        body: chunk,
      });
    }
  }
  return blocks;
};

/** Extract all "diff --git a/<path> b/<path>" pairs in a patch body. */
const parseDiffHeaders = (body: string): Array<{ a: string; b: string }> => {
  const re = /^diff --git a\/(.+?) b\/(.+?)\s*$/gm;
  const out: Array<{ a: string; b: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    out.push({ a: toPosix(m[1] ?? ''), b: toPosix(m[2] ?? '') });
  }
  return out;
};

/** Legacy helper (retained for potential future use). */
const isCommitLast = (text: string): boolean => {
  // Find the commit heading
  const m = text.match(H_COMMIT);
  if (!m) return false;
  const idx = text.search(H_COMMIT);
  if (idx < 0) return false;
  // From heading to end, find the first fence and its matching close
  const tail = text.slice(idx);
  const fenceOpen = tail.match(/^`{3,}/m);
  if (!fenceOpen) return false;
  const openLine = fenceOpen[0];
  const ticks = (openLine.match(/`/g) ?? []).length;
  // Find closing fence with same tick count
  const closeRe = new RegExp(`^\\\`${'{'}${ticks}{'}'}\\s*$`, 'm');
  const closeMatch = tail.match(closeRe);
  if (!closeMatch) return false;
  const closeIdx = tail.search(closeRe);
  if (closeIdx < 0) return false;
  // Nothing but whitespace allowed after the closing fence
  const after = tail.slice(closeIdx + ticks).trim();
  return after.length === 0;
};

/** Extract unfenced File Ops body: lines after "### File Ops" up to next heading or EOF. */
const extractFileOpsBody = (text: string): string | null => {
  const hm = H_FILE_OPS.exec(text);
  if (!hm) return null;
  const afterIdx = (hm.index ?? 0) + hm[0].length;
  const tail = text.slice(afterIdx);
  const lines = tail.split(/\r?\n/);
  // Skip leading blank lines after heading
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  const out: string[] = [];
  for (; i < lines.length; i += 1) {
    const l = lines[i];
    if (/^#{2,3}\s+/.test(l)) break;
    out.push(l);
  }
  const body = out.join('\n').trimEnd();
  return body.length ? body : null;
};

/** Validate optional "### File Ops" fenced block. Pushes errors into `errors`. */
const validateFileOpsBlock = (text: string, errors: string[]): void => {
  const body = extractFileOpsBody(text);
  if (!body) return; // no block present
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const s = raw.trim();
    if (!s) continue;
    const parts = s.split(/\s+/);
    const verb = parts[0];
    const args = parts.slice(1);
    const where = `File Ops line ${(i + 1).toString()}`;
    const bad = (msg: string) => errors.push(`${where}: ${msg}`);
    const normSafe = (p?: string): string | null => {
      if (!p || !p.trim()) return null;
      // Compute raw POSIX form first and reject absolute paths before normalization,
      // since normalization previously stripped leading "/" and could misclassify.
      const raw = toPosix(p.trim());
      if (isAbsolutePosix(raw)) return null;
      const posix = normalizePosix(raw);
      if (!posix) return null;
      if (posix.split('/').some((seg) => seg === '..')) return null;
      return posix;
    };
    if (!/^(mv|rm|rmdir|mkdirp)$/.test(verb)) {
      bad(`unknown verb "${verb}"`);
      continue;
    }
    if (verb === 'mv') {
      if (args.length !== 2) {
        bad(`expected 2 paths, got ${args.length.toString()}`);
        continue;
      }
      const src = normSafe(args[0]);
      const dest = normSafe(args[1]);
      if (!src || !dest) bad('mv: invalid repo-relative path');
      continue;
    }
    // rm | rmdir | mkdirp
    if (args.length !== 1) {
      bad(`expected 1 path, got ${args.length.toString()}`);
      continue;
    }
    const only = normSafe(args[0]);
    if (!only) bad(`${verb}: invalid repo-relative path`);
  }
};

/** Validate an assistant reply body against response-format rules. */
export const validateResponseMessage = (text: string): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Optional File Ops block (pre-ops) — validate when present
  validateFileOpsBlock(text, errors);

  const blocks = extractBlocks(text);
  const patches = blocks.filter((b) => b.kind === 'patch');
  const listings = blocks.filter((b) => b.kind === 'full');
  const commitBlocks = blocks.filter((b) => b.kind === 'commit');

  // Require at least one Patch block for a valid response.
  // This validator is intended for patch-carrying replies; a commit-only body is not valid here.
  if (patches.length === 0) {
    errors.push('No Patch blocks found');
  }

  // 1) One Patch per file
  {
    const seen = new Map<string, Block[]>();
    for (const p of patches) {
      const k = p.path ?? '(unknown)';
      const list = seen.get(k) ?? [];
      list.push(p);
      seen.set(k, list);
      // Also check its internal diff headers count and path match
      const diffs = parseDiffHeaders(p.body);
      if (diffs.length === 0) {
        errors.push(
          `Patch for ${k} has no "diff --git a/<path> b/<path>" header; emit a plain unified diff with git-style headers (wrappers like "*** Begin Patch" are not allowed)`,
        );
      } else if (diffs.length !== 1) {
        errors.push(
          `Patch for ${k} contains multiple "diff --git" headers (found ${diffs.length.toString()}; expected 1)`,
        );
      }
      // Forbidden wrappers detection (defensive clarity)
      const wrapperRe =
        /(^|\n)\*{3,}\s*(Begin|End)\s+Patch\b|(^|\n)Index:\s|(^|\n)\*{3,}\s*Add\s+File:/i;
      try {
        if (wrapperRe.test(p.body)) {
          errors.push(
            `Patch for ${k} contains a forbidden wrapper ("*** Begin Patch", "*** Add File:", or "Index:"). Use plain unified diff only.`,
          );
        }
      } catch {
        /* ignore */
      }
    }
    for (const [k, list] of seen.entries()) {
      if (list.length > 1) {
        errors.push(
          `Multiple Patch blocks found for ${k} (${list.length.toString()})`,
        );
      }
    }
  }

  // 2) Patch precedes Full Listing (when both exist for the same file)
  {
    const fullIndex = new Map<string, Block>();
    for (const f of listings) {
      const key = toPosix(f.path ?? '(unknown)');
      fullIndex.set(key, f);
    }
    for (const p of patches) {
      const key = toPosix(p.path ?? '(unknown)');
      const f = fullIndex.get(key);
      if (f && !(p.start < f.start)) {
        errors.push(
          `Ordering violation for ${key}: Full Listing appears before Patch`,
        );
      }
    }
  }

  // 3) Commit Message last (and present)
  if (commitBlocks.length === 0) {
    errors.push('Missing "## Commit Message" section');
  } else {
    const last = blocks[blocks.length - 1];
    if (!last || last.kind !== 'commit') {
      errors.push('Commit Message is not last');
    }
  }

  // 4) TODO patch requirement with docs-only exception
  if (patches.length > 0) {
    const targets: string[] = [];
    for (const p of patches) {
      const diffs = parseDiffHeaders(p.body);
      if (diffs.length > 0) {
        const b = toPosix(diffs[0].b ?? '');
        if (b) targets.push(b);
      } else {
        const k = toPosix(p.path ?? '');
        if (k) targets.push(k);
      }
    }
    const isTodo = (s: string) => toPosix(s) === '.stan/system/stan.todo.md';
    const isDoc = (s: string) => {
      const rel = toPosix(s);
      if (!rel) return false;
      const base = rel.split('/').pop() ?? rel;
      const baseLC = base.toLowerCase();
      if (
        baseLC === 'readme.md' ||
        baseLC === 'changelog.md' ||
        baseLC === 'contributing.md' ||
        baseLC === 'license' ||
        baseLC === 'license.md'
      ) {
        return true;
      }
      return (
        rel.startsWith('docs/') ||
        rel.startsWith('docs-src/') ||
        rel.startsWith('diagrams/')
      );
    };
    const nonTodo = targets.filter((t) => !isTodo(t));
    const docsOnly = nonTodo.length > 0 && nonTodo.every((t) => isDoc(t));
    if (!docsOnly) {
      const hasTodo = targets.some((t) => isTodo(t));
      if (!hasTodo) {
        errors.push(
          'Doc cadence violation: Patch present but no Patch for ".stan/system/stan.todo.md"',
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
};
/** Throw on validation failure (convenience API). */
export const validateOrThrow = (text: string): void => {
  const res = validateResponseMessage(text);
  if (!res.ok) {
    const msg =
      'Response-format validation failed:\n' +
      res.errors.map((e) => `- ${e}`).join('\n');
    throw new Error(msg);
  }
};

// Re-exports for testing
export const __internal = { extractBlocks, parseDiffHeaders, isCommitLast };
