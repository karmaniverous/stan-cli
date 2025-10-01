/* src/stan/patch/file-ops.ts
 * File Ops (pre-ops) parser and executor.
 * Verbs: mv <src> <dest> | rm <path> | rmdir <path> | mkdirp <path>
 * - Repo-relative POSIX paths only; deny absolute and any traversal outside repo root.
 * - mv: files or directories (recursive), no overwrite.
 * - rm: files or directories (recursive).
 * - rmdir: empty directories only (safety).
 * - Dry-run mode validates constraints without changing the filesystem.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { ensureDir, move as moveAsync, pathExists, remove } from 'fs-extra';

export type FileOp =
  | { verb: 'mv'; src: string; dest: string }
  | { verb: 'rm'; src: string }
  | { verb: 'rmdir'; src: string }
  | { verb: 'mkdirp'; src: string };
export type FileOpsPlan = { ops: FileOp[]; errors: string[] };
export type OpResult = {
  verb: FileOp['verb'];
  src?: string;
  dest?: string;
  status: 'ok' | 'failed';
  errno?: string;
  message?: string;
};

const toPosix = (p: string): string =>
  p.replace(/\\/g, '/').replace(/^\.\/+/, '');

const isAbsolutePosix = (p: string): boolean => /^[/\\]/.test(p);

const normalizePosix = (p: string): string => {
  // Normalize with posix semantics, then strip trailing slash (except root).
  const norm = path.posix.normalize(toPosix(p));
  return norm === '/' ? norm : norm.replace(/\/+$/, '');
};

/** Ensure a repo-relative path stays within repo root after resolution. */
const resolveWithin = (
  cwd: string,
  rel: string,
): { abs: string; ok: boolean } => {
  const abs = path.resolve(cwd, rel);
  // Hardened prefix check (realpath not needed for normalized, repo-relative inputs).
  const root = path.resolve(cwd) + path.sep;
  const ok = abs === path.resolve(cwd) || abs.startsWith(root);
  return { abs, ok };
};

/**
 * Extract the unfenced body that follows "### File Ops" up to the next heading
 * (## or ###) or end of text. Leading blank lines after the heading are skipped.
 */
const extractOpsBody = (source: string): { body: string } | null => {
  const headingRe = /^###\s+File Ops\s*$/m;
  const hm = headingRe.exec(source);
  if (!hm) return null;
  const afterIdx = (hm.index ?? 0) + hm[0].length;
  const tail = source.slice(afterIdx);
  const lines = tail.split(/\r?\n/);
  // Skip leading blank lines
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  const bodyLines: string[] = [];
  for (; i < lines.length; i += 1) {
    const l = lines[i];
    if (/^#{2,3}\s+/.test(l)) break;
    bodyLines.push(l);
  }
  return { body: bodyLines.join('\n').trimEnd() };
};

/** Parse the optional "### File Ops" fenced block from a reply body. */
export const parseFileOpsBlock = (source: string): FileOpsPlan => {
  const ops: FileOp[] = [];
  const errors: string[] = [];
  const extracted = extractOpsBody(source);
  if (!extracted) return { ops, errors }; // no block present; treat as absent
  const body = extracted.body;
  const lines = body.split(/\r?\n/);
  let lineNo = 0;
  for (const raw of lines) {
    lineNo += 1;
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const verbRaw = parts[0]; // keep raw string for unknown verb reporting
    const args = parts.slice(1);
    const bad = (msg: string) => {
      errors.push(`file-ops line ${lineNo.toString()}: ${msg}`);
    };

    const needsOne = (ok: boolean) => {
      if (!ok) bad(`expected 1 path, got ${args.length.toString()}`);
    };
    const needsTwo = (ok: boolean) => {
      if (!ok) bad(`expected 2 paths, got ${args.length.toString()}`);
    };

    const normSafe = (p?: string): string | null => {
      if (!p || !p.trim()) return null;
      const posix = normalizePosix(p);
      if (!posix || isAbsolutePosix(posix)) return null;
      if (posix.split('/').some((seg) => seg === '..')) return null;
      return posix;
    };

    switch (verbRaw) {
      case 'mv': {
        needsTwo(args.length === 2);
        if (args.length === 2) {
          const src = normSafe(args[0]);
          const dest = normSafe(args[1]);
          if (!src || !dest) bad('mv: invalid repo-relative path');
          else ops.push({ verb: 'mv', src, dest });
        }
        break;
      }
      case 'rm': {
        needsOne(args.length === 1);
        if (args.length === 1) {
          const src = normSafe(args[0]);
          if (!src) bad('rm: invalid repo-relative path');
          else ops.push({ verb: 'rm', src });
        }
        break;
      }
      case 'rmdir': {
        needsOne(args.length === 1);
        if (args.length === 1) {
          const src = normSafe(args[0]);
          if (!src) bad('rmdir: invalid repo-relative path');
          else ops.push({ verb: 'rmdir', src });
        }
        break;
      }
      case 'mkdirp': {
        needsOne(args.length === 1);
        if (args.length === 1) {
          const src = normSafe(args[0]);
          if (!src) bad('mkdirp: invalid repo-relative path');
          else ops.push({ verb: 'mkdirp', src });
        }
        break;
      }
      default:
        bad(`unknown verb "${verbRaw}"`);
        break;
    }
  }
  return { ops, errors };
};
/** Execute File Ops with safety checks. Returns per-op results and overall ok. */
export const executeFileOps = async (
  cwd: string,
  ops: FileOp[],
  dryRun = false,
): Promise<{ ok: boolean; results: OpResult[] }> => {
  const results: OpResult[] = [];

  const within = (rel: string): { abs: string; ok: boolean } =>
    resolveWithin(cwd, rel);

  for (const op of ops) {
    const res: OpResult = {
      verb: op.verb,
      src: (op as { src?: string }).src,
      dest: (op as { dest?: string }).dest,
      status: 'ok',
    };
    try {
      if (op.verb === 'mv') {
        const { abs: srcAbs, ok: sOK } = within(op.src);
        const { abs: dstAbs, ok: dOK } = within(op.dest);
        if (!sOK || !dOK) throw new Error('path escapes repo root');
        // Existence checks via fs-extra
        const srcExists = await pathExists(srcAbs);
        const dstExists = await pathExists(dstAbs);
        if (!srcExists) throw new Error('source does not exist');
        if (dstExists) throw new Error('destination exists (no overwrite)');
        if (!dryRun) {
          await ensureDir(path.dirname(dstAbs));
          // fs-extra handles files or directories; cross-device safe
          await moveAsync(srcAbs, dstAbs, { overwrite: false });
        }
      } else if (op.verb === 'rm') {
        // Recursive remove of file or directory
        const { abs, ok } = within(op.src);
        if (!ok) throw new Error('path escapes repo root');
        const exists = await pathExists(abs);
        if (!exists) throw new Error('path does not exist');
        if (!dryRun) await remove(abs);
      } else if (op.verb === 'rmdir') {
        const { abs, ok } = within(op.src);
        if (!ok) throw new Error('path escapes repo root');
        let st: import('fs').Stats | null = null;
        try {
          st = await stat(abs);
        } catch {
          st = null;
        }
        if (!st) throw new Error('directory does not exist');
        if (!st.isDirectory()) throw new Error('not a directory');
        const entries = await readdir(abs);
        if (entries.length > 0) throw new Error('directory not empty');
        if (!dryRun) await remove(abs);
      } else if (op.verb === 'mkdirp') {
        const { abs, ok } = within(op.src);
        if (!ok) throw new Error('path escapes repo root');
        if (!dryRun) await ensureDir(abs);
      }
      res.status = 'ok';
    } catch (e) {
      res.status = 'failed';
      const msg = e instanceof Error ? e.message : String(e);
      res.message = msg;
    }
    results.push(res);
    if (res.status === 'failed' && !dryRun) break; // stop on first failure in apply mode
  }

  const ok = results.every((r) => r.status === 'ok');
  return { ok, results };
};
/** Persist File Ops results to .stan/patch/.debug/ops.json (best-effort). */
export const writeOpsDebugLog = async (
  cwd: string,
  stanPath: string,
  results: OpResult[],
): Promise<void> => {
  try {
    const debugDir = path.join(cwd, stanPath, 'patch', '.debug');
    await ensureDir(debugDir);
    const file = path.join(debugDir, 'ops.json');
    const body = JSON.stringify({ results }, null, 2);
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(file, body, 'utf8'),
    );
  } catch {
    // best-effort
  }
};
