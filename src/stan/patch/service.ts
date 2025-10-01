// src/stan/patch/service.ts
/* src/stan/patch/service.ts
 * Patch application service (no Commander). The CLI adapter delegates here.
 */
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { statusFail, statusOk } from '@/stan/util/status';

import { loadConfig } from '../config';
import { preflightDocsAndVersion } from '../preflight';
import { getVersionInfo } from '../version';
import { detectAndCleanPatch } from './clean';
import { resolvePatchContext } from './context';
import { seemsUnifiedDiff } from './detect';
import { executeFileOps, parseFileOpsBlock } from './file-ops';
import { formatPatchFailure } from './format';
import { maybeWarnStaged } from './git-status';
import { pathsFromPatch } from './headers';
import { openFilesInEditor } from './open';
import { applyPatchPipeline } from './run/pipeline';
import { readPatchSource } from './run/source';
import { ensureParentDir } from './util/fs';

// Early path helper
const fileExists = (cwd: string, rel: string): boolean =>
  existsSync(path.join(cwd, rel));

/** Attempt to copy text to clipboard; return true on success. */
const tryCopyToClipboard = async (text: string): Promise<boolean> => {
  try {
    // In tests, avoid clipboard side effects unless explicitly forced.
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.STAN_FORCE_CLIPBOARD !== '1'
    ) {
      return false;
    }
    const { default: clipboardy } = (await import('clipboardy')) as {
      default: { write: (t: string) => Promise<void> };
    };
    await clipboardy.write(text);
    return true;
  } catch {
    return false;
  }
};

/** Extract the body of the first fenced block immediately following "### File Ops". */
const extractFileOpsBody = (raw: string): string | null => {
  const headingRe = /^###\s+File Ops\s*$/m;
  const hm = headingRe.exec(raw);
  if (!hm) return null;
  const afterIdx = (hm.index ?? 0) + hm[0].length;
  const tail = raw.slice(afterIdx);
  const lines = tail.split(/\r?\n/);
  let open = -1;
  let ticks = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^\s*(`{3,})/);
    if (m) {
      open = i;
      ticks = m[1].length;
      break;
    }
    if (/^#{2,3}\s+/.test(lines[i])) break;
  }
  if (open < 0 || ticks < 3) return null;
  const fence = '`'.repeat(ticks);
  for (let i = open + 1; i < lines.length; i += 1) {
    if (lines[i].trimEnd() === fence) {
      return lines.slice(open + 1, i).join('\n');
    }
    if (/^#{2,3}\s+/.test(lines[i])) break;
  }
  return null;
};

export const runPatch = async (
  cwd0: string,
  inputMaybe?: string,
  opts?: {
    file?: string | boolean;
    check?: boolean;
    /** Default patch file from config; used when no arg/-f provided and not ignored by noFile. */
    defaultFile?: string | null | undefined;
    /** Ignore default file (forces clipboard unless argument/-f provided). */
    noFile?: boolean;
  },
): Promise<void> => {
  const { cwd, patchAbs, patchRel } = await resolvePatchContext(cwd0);

  // Preflight docs/version (non-blocking; best-effort)
  try {
    await preflightDocsAndVersion(cwd);
  } catch (err) {
    if (process.env.STAN_DEBUG === '1') {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('stan: preflight failed', msg);
    }
  }

  // Resolve repo config (open command default lives here)
  let patchOpenCommand: string | undefined;
  try {
    const cfg = await loadConfig(cwd);
    patchOpenCommand = cfg.patchOpenCommand;
  } catch {
    patchOpenCommand = undefined;
  }

  // Resolve and read source (with user-facing log)
  let raw = '';
  try {
    const src = await readPatchSource(cwd, inputMaybe, {
      file: opts?.file,
      defaultFile: opts?.defaultFile ?? undefined,
      ignoreDefaultFile: Boolean(opts?.noFile),
    });
    if (src.kind === 'clipboard') {
      console.log('stan: patch source: clipboard');
    } else if (src.kind === 'argument') {
      console.log('stan: patch source: argument');
    } else {
      console.log(
        `stan: patch source: file "${(src.filePathRel ?? '').replace(/\\/g, '/')}"`,
      );
    }
    raw = src.raw;
  } catch (e) {
    console.error('stan: failed to read patch source', e);
    return;
  }

  // Always persist RAW patch input for manual reprocessing regardless of kind.
  // This follows canonical workspace policy (no diagnostics persistence).
  try {
    await ensureParentDir(patchAbs);
    await writeFile(patchAbs, raw, 'utf8');
  } catch (e) {
    console.error('stan: failed to write raw patch', e);
    return;
  }

  // Kind resolution (header-driven): presence of "### File Ops" indicates ops-kind.

  // Determine context: downstream vs STAN repo
  let isDevModuleRepo = false;
  try {
    isDevModuleRepo = Boolean((await getVersionInfo(cwd)).isDevModuleRepo);
  } catch {
    // best-effort; default downstream
    isDevModuleRepo = false;
  }

  // Optional File Ops block (pre-ops): parse early; if present, treat this
  // payload as a File Ops patch and short-circuit on success. The CLI does not
  // enforce single-kind; it processes the declared kind only and does not
  // attempt to detect or reject additional content outside the ops block.
  const opsPlan = parseFileOpsBlock(raw);
  const hasOpsHeader = Boolean(opsPlan.ops.length || opsPlan.errors.length);
  if (hasOpsHeader && opsPlan.errors.length) {
    // Treat any parse error as a File Ops failure per policy.
    const body = extractFileOpsBody(raw) ?? '';
    const prompt = isDevModuleRepo
      ? formatPatchFailure({
          context: 'stan',
          kind: 'file-ops',
          fileOpsErrors: opsPlan.errors.slice(),
        })
      : formatPatchFailure({
          context: 'downstream',
          kind: 'file-ops',
          fileOpsBlock: body,
        });
    const copied = await tryCopyToClipboard(prompt);
    if (!copied) console.log(prompt);
    return;
  }
  if (hasOpsHeader && opsPlan.ops.length > 0) {
    // Execute File Ops (kind=ops). In --check mode, validate only (no side-effects).
    try {
      const dry = Boolean(opts?.check);
      const { ok, results } = await executeFileOps(cwd, opsPlan.ops, dry);
      if (!ok) {
        const body = extractFileOpsBody(raw) ?? '';
        const errors =
          results
            .filter((r) => r.status === 'failed')
            .map((r) => {
              const base =
                r.verb === 'mv' && r.src && r.dest
                  ? `${r.verb} ${r.src} ${r.dest}`
                  : r.src
                    ? `${r.verb} ${r.src}`
                    : r.verb;
              return `file-ops failed: ${base}${r.message ? ` — ${r.message}` : ''}`;
            }) ?? [];
        const prompt = isDevModuleRepo
          ? formatPatchFailure({
              context: 'stan',
              kind: 'file-ops',
              fileOpsErrors: errors,
            })
          : formatPatchFailure({
              context: 'downstream',
              kind: 'file-ops',
              fileOpsBlock: body,
            });
        const copied = await tryCopyToClipboard(prompt);
        if (!copied) console.log(prompt);
        return;
      }
      // Success: ops-kind patch short-circuits; do not proceed to unified-diff pipeline.
      console.log(statusOk(dry ? 'patch check passed' : 'patch applied'));
      return;
    } catch (e) {
      console.error('stan: file ops execution failed', e);
      return;
    }
  }

  // Detect & clean (unified diff path), tolerant to surrounding prose
  const cleaned = detectAndCleanPatch(raw);
  // Collect touched-file candidates from headers (for diagnostics and staged check)
  const changedFromHeaders = pathsFromPatch(cleaned);

  if (!seemsUnifiedDiff(cleaned)) {
    console.error(
      'stan: input is not a unified diff; expected headers like "diff --git a/<path> b/<path>" with subsequent "---"/"+++" and "@@" hunks.',
    );
    console.log(statusFail('patch failed'));
    return;
  }

  console.log(`stan: applying patch "${patchRel}"`);

  const check = Boolean(opts?.check);
  const { ok, result, js } = await applyPatchPipeline({
    cwd,
    patchAbs,
    cleaned,
    check,
  });

  if (ok) {
    // Warn if any of the patched files appear staged
    const touched =
      js && js.okFiles.length > 0 ? js.okFiles : changedFromHeaders;
    await maybeWarnStaged(cwd, touched);

    console.log(statusOk(check ? 'patch check passed' : 'patch applied'));

    // Open modified files (unless deleted) when not --check
    if (!check) {
      const candidates =
        js && js.okFiles.length > 0 ? js.okFiles : changedFromHeaders;
      const existing = candidates.filter((rel) => fileExists(cwd, rel));
      if (existing.length) {
        openFilesInEditor({
          cwd,
          files: existing,
          openCommand: patchOpenCommand ?? 'code -g {file}',
        });
      }
    }

    return;
  }

  // Failure: build target list with header-derived fallback when jsdiff is generic (“(patch)”)
  const failedPathsRaw = js?.failed?.map((f) => f.path) ?? [];
  const isPlaceholder = (p: string | undefined): boolean =>
    !p || p === '(patch)' || p === '(unknown)';

  let targets: string[] = [];
  if (
    failedPathsRaw.length === 0 ||
    failedPathsRaw.every((p) => isPlaceholder(p))
  ) {
    // Global/unnamed parse failure: prefer header-derived paths when available
    targets = changedFromHeaders.length
      ? [...changedFromHeaders]
      : failedPathsRaw.filter((p): p is string => !!p);
  } else {
    // Keep only concrete paths and ignore placeholders
    targets = failedPathsRaw.filter((p): p is string => !isPlaceholder(p));
    // If nothing remains, fall back to headers when present
    if (targets.length === 0 && changedFromHeaders.length) {
      targets = [...changedFromHeaders];
    }
  }

  const uniqueTargets = Array.from(new Set(targets));

  // Compose context-appropriate failure prompt
  let prompt: string;
  if (isDevModuleRepo) {
    // Build attempts summary for diagnostics (label, exit, first line)
    const attempts =
      (result.captures ?? []).map((c) => ({
        label: c.label,
        code: c.code,
        stderr: c.stderr,
      })) ?? [];
    // Always include js reasons when available
    const jsReasons = js?.failed?.length
      ? js.failed.map((f) => ({ path: f.path, reason: f.reason }))
      : [];
    prompt = formatPatchFailure({
      context: 'stan',
      kind: 'diff',
      targets: uniqueTargets,
      attempts,
      jsReasons,
    });
  } else {
    // Downstream: include the same attempt summary and jsdiff reasons so the
    // diagnostics envelope is populated (unified behavior).
    const attempts =
      (result.captures ?? []).map((c) => ({
        label: c.label,
        code: c.code,
        stderr: c.stderr,
      })) ?? [];
    const jsReasons = js?.failed?.length
      ? js.failed.map((f) => ({ path: f.path, reason: f.reason }))
      : [];
    prompt = formatPatchFailure({
      context: 'downstream',
      kind: 'diff',
      targets: uniqueTargets,
      attempts,
      jsReasons,
    });
  }
  {
    const copied = await tryCopyToClipboard(prompt);
    if (!copied) {
      console.log(prompt);
    }
  }

  // Open target files even when the patch fails (unless --check)
  if (!check) {
    const existing = changedFromHeaders.filter((rel) => fileExists(cwd, rel));
    if (existing.length) {
      openFilesInEditor({
        cwd,
        files: existing,
        openCommand: patchOpenCommand ?? 'code -g {file}',
      });
    }
  }

  console.log(statusFail(check ? 'patch check failed' : 'patch failed'));
  console.log(
    `tried: ${result.tried.join(', ')}; jsdiff ok: ${(js?.okFiles?.length ?? 0).toString()}, failed: ${(js?.failed?.length ?? 0).toString()}`,
  );
};
