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

/** Best-effort status label for BORING/non-TTY parity. */
const statusOk = (s: string): string => `[OK] ${s}`;
const statusFail = (s: string): string => `[FAIL] ${s}`;

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
      console.log(
        `stan: ${statusOk(check ? 'patch check passed' : 'patch applied')}`,
      );
    } else {
      console.log(
        `stan: ${statusFail(check ? 'patch check failed' : 'patch failed')}`,
      );
    }
  } catch {
    console.log(
      `stan: ${statusFail(check ? 'patch check failed' : 'patch failed')}`,
    );
  }
};
