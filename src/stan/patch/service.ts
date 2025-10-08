/** src/stan/patch/service.ts
 * CLI-facing patch service:
 * - Acquire patch from argument, file (-f), default file from config, or clipboard.
 * - Clean payload via stan-core.
 * - Persist to <stanPath>/patch/.patch.
 * - Apply via stan-core pipeline (git apply cascade + jsdiff fallback).
 * - Print concise terminal status lines and source.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  applyPatchPipeline,
  detectAndCleanPatch,
  findConfigPathSync,
  loadConfigSync,
} from '@karmaniverous/stan-core';
import clipboardy from 'clipboardy';
import { ensureDir } from 'fs-extra';

import { error as colorError, ok as colorOk } from '@/stan/util/color';
type RunPatchOptions = {
  file?: string | boolean;
  defaultFile?: string;
  noFile?: boolean;
  check?: boolean;
};
const readFromFile = async (cwd: string, relOrAbs: string): Promise<string> => {
  const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(cwd, relOrAbs);
  return readFile(abs, 'utf8');
};

const resolveStanPath = (cwd: string): string => {
  try {
    const p = findConfigPathSync(cwd);
    if (p) return loadConfigSync(cwd).stanPath;
  } catch {
    // fall through to default
  }
  return '.stan';
};

/** BORING detection aligned with util/color (TTY + environment). */
const isBoring = (): boolean => {
  const isTTY = Boolean(
    (process.stdout as unknown as { isTTY?: boolean })?.isTTY,
  );
  return (
    process.env.STAN_BORING === '1' ||
    process.env.NO_COLOR === '1' ||
    process.env.FORCE_COLOR === '0' ||
    !isTTY
  );
};

/** Status tokens: colorized in TTY; bracketed in BORING/non‑TTY. */
const statusOk = (s: string): string =>
  isBoring() ? `[OK] ${s}` : `${colorOk('✔')} ${s}`;
const statusFail = (s: string): string =>
  isBoring() ? `[FAIL] ${s}` : `${colorError('✖')} ${s}`;

export const runPatch = async (
  cwd: string,
  inputMaybe: string | undefined,
  opts: RunPatchOptions = {},
): Promise<void> => {
  let source = 'clipboard';
  let raw = '';

  try {
    if (typeof inputMaybe === 'string' && inputMaybe.trim().length > 0) {
      raw = inputMaybe;
      source = 'argument';
    } else if (typeof opts.file === 'string' && opts.file.trim().length > 0) {
      raw = await readFromFile(cwd, opts.file.trim());
      source = `file "${opts.file.trim()}"`;
    } else if (opts.file === true) {
      // -f with no filename: prefer defaultFile when available; otherwise clipboard
      if (
        !opts.noFile &&
        typeof opts.defaultFile === 'string' &&
        opts.defaultFile.trim().length
      ) {
        raw = await readFromFile(cwd, opts.defaultFile.trim());
        source = `file "${opts.defaultFile.trim()}"`;
      } else {
        raw = await clipboardy.read();
        source = 'clipboard';
      }
    } else if (
      !opts.noFile &&
      typeof opts.defaultFile === 'string' &&
      opts.defaultFile.trim().length
    ) {
      raw = await readFromFile(cwd, opts.defaultFile.trim());
      source = `file "${opts.defaultFile.trim()}"`;
    } else {
      raw = await clipboardy.read();
      source = 'clipboard';
    }
  } catch {
    console.log(`stan: ${statusFail('patch failed')} (unable to read source)`);
    return;
  }

  // Clean payload
  let cleaned = '';
  try {
    cleaned = detectAndCleanPatch(raw);
  } catch {
    cleaned = '';
  }

  console.log(`stan: patch source: ${source}`);

  // Extract the first target path from the diff headers for clickable IDE links.
  const parseFirstTargetPath = (diffText: string): string | null => {
    // Prefer +++ b/<path>
    const mPlus = diffText.match(/^\+\+\+\s+b\/([^\r\n]+)$/m);
    if (mPlus && mPlus[1]) return mPlus[1].trim().replace(/\\/g, '/');
    // Fallback: diff --git a/<a> b/<b>
    const mGit = diffText.match(/^diff --git a\/([^\s]+)\s+b\/([^\s]+)$/m);
    if (mGit && mGit[2]) return mGit[2].trim().replace(/\\/g, '/');
    return null;
  };
  const firstTarget = parseFirstTargetPath(cleaned);

  /** Compose a compact diagnostics envelope from applyPatchPipeline outcome. */
  const composeDiagnostics = (out: {
    result?: {
      captures?: Array<{ label?: string; code?: number; stderr?: string }>;
    };
    js?: { failed?: Array<{ path?: string; reason?: string }> };
  }): string => {
    const lines: string[] = [];
    lines.push('START PATCH DIAGNOSTICS');
    const caps = (out?.result?.captures ?? []) as Array<{
      label?: string;
      code?: number;
      stderr?: string;
    }>;
    for (const c of caps) {
      const firstStderr =
        (c.stderr ?? '').split(/\r?\n/).find((l) => l.trim().length) ?? '';
      lines.push(`${c.label ?? 'git'}: exit ${c.code ?? 0} — ${firstStderr}`);
    }
    const failed = (out?.js?.failed ?? []) as Array<{
      path?: string;
      reason?: string;
    }>;
    for (const f of failed) {
      lines.push(`jsdiff: ${f.path ?? '(unknown)'}: ${f.reason ?? ''}`);
    }
    lines.push('END PATCH DIAGNOSTICS');
    return lines.join('\n');
  };

  // Persist cleaned payload (best-effort)
  const stanPath = resolveStanPath(cwd);
  const patchDir = path.join(cwd, stanPath, 'patch');
  const patchAbs = path.join(patchDir, '.patch');
  try {
    await ensureDir(patchDir);
    await writeFile(patchAbs, cleaned, 'utf8');
  } catch {
    // ignore persistence failures; still attempt to apply from memory
  }

  // Short-circuit: nothing usable
  if (cleaned.trim().length === 0) {
    console.log(`stan: ${statusFail('patch failed')} (no unified diff found)`);
    return;
  }

  // Apply
  const check = Boolean(opts.check);
  try {
    const out = await applyPatchPipeline({
      cwd,
      patchAbs,
      cleaned,
      check,
    });
    if (out.ok) {
      const msg = check ? 'patch check passed' : 'patch applied';
      const tail = firstTarget ? ` -> ${firstTarget}` : '';
      console.log(`stan: ${statusOk(msg)}${tail}`);
      // Visual separation from next prompt
      console.log('');
      return;
    }
    // Failure: compose diagnostics, persist to .debug, try to copy to clipboard.
    const diag = composeDiagnostics(
      out as unknown as {
        result?: {
          captures?: Array<{ label?: string; code?: number; stderr?: string }>;
        };
        js?: { failed?: Array<{ path?: string; reason?: string }> };
      },
    );
    // Persist under <stanPath>/patch/.debug/feedback.txt (best‑effort)
    const dbgDir = path.join(cwd, stanPath, 'patch', '.debug');
    const dbgPath = path.join(dbgDir, 'feedback.txt');
    try {
      await ensureDir(dbgDir);
      await writeFile(dbgPath, diag, 'utf8');
    } catch {
      /* ignore persistence errors */
    }
    // Try to copy to clipboard; fallback to console
    let copied = false;
    try {
      await clipboardy.write(diag);
      copied = true;
    } catch {
      /* ignore clipboard errors */
    }
    const failMsg = check ? 'patch check failed' : 'patch failed';
    console.log(`stan: ${statusFail(failMsg)}`);
    // Brief guidance so users know what to do next
    if (copied) {
      console.log(
        'stan: Patch diagnostics uploaded to clipboard. Paste into chat for full listing.',
      );
    } else {
      console.log(
        `stan: Patch diagnostics written to ${path
          .relative(cwd, dbgPath)
          .replace(/\\/g, '/')} — copy and paste into chat for full listing.`,
      );
    }
    // Visual separation from next prompt
    console.log('');
    if (!copied) {
      // Provide the envelope on stdout if clipboard unsupported
      console.log(diag);
    }
  } catch {
    console.log(
      `stan: ${statusFail(check ? 'patch check failed' : 'patch failed')}`,
    );
    console.log('');
  }
};
