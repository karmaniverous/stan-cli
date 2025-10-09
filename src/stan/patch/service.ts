/** src/stan/patch/service.ts
 * CLI-facing patch orchestrator.
 * - Acquire raw patch from argument/file/default/clipboard (input.ts).
 * - Recognize & enforce patch kind:
 *   • File Ops only (no diff) → execute/validate ops.
 *   • Diff only (no File Ops) → enforce single-file rule, then apply.
 * - Persist the raw body to <stanPath>/patch/.patch (auditable).
 * - Compose compact diagnostics envelopes with declared targets (diagnostics.ts).
 * - After successful diff apply (non--check), best‑effort open the modified file in the editor
 *   configured by patchOpenCommand (default: "code -g \{file\}").
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  applyPatchPipeline,
  detectAndCleanPatch,
  executeFileOps,
  findConfigPathSync,
  loadConfigSync,
  parseFileOpsBlock,
} from '@karmaniverous/stan-core';
import { ensureDir } from 'fs-extra';

import {
  composeDiffFailureEnvelope,
  composeFileOpsFailuresEnvelope,
  composeInvalidFileOpsWithDiffEnvelope,
  composeMultiFileInvalidEnvelope,
} from '@/stan/patch/diagnostics';
import {
  collectPatchedTargets,
  enforceSingleFileDiff,
  parseFirstTarget,
} from '@/stan/patch/diff';
import { maybeOpenFiles } from '@/stan/patch/editor';
import { readPatchSource } from '@/stan/patch/input';
import { statusFail, statusOk } from '@/stan/patch/status';

export type RunPatchOptions = {
  file?: string | boolean;
  defaultFile?: string;
  noFile?: boolean;
  check?: boolean;
};

const resolveStanPath = (cwd: string): string => {
  try {
    const p = findConfigPathSync(cwd);
    if (p) return loadConfigSync(cwd).stanPath;
  } catch {
    /* ignore */
  }
  return '.stan';
};

export const runPatch = async (
  cwd: string,
  inputMaybe: string | undefined,
  opts: RunPatchOptions = {},
): Promise<void> => {
  // 1) Acquire raw input
  let raw = '';
  let source = 'clipboard';
  try {
    const got = await readPatchSource(cwd, inputMaybe, {
      file: opts.file,
      defaultFile: opts.defaultFile,
      noFile: opts.noFile,
    });
    raw = got.raw;
    source = got.source;
  } catch {
    console.log(`stan: ${statusFail('patch failed')} (unable to read source)`);
    return;
  }
  console.log(`stan: patch source: ${source}`);

  // 2) Classify kind (File Ops vs Diff)
  const opsPlan = parseFileOpsBlock(raw);
  const hasOps = (opsPlan.ops?.length ?? 0) > 0;
  let cleaned = '';
  try {
    cleaned = detectAndCleanPatch(raw);
  } catch {
    cleaned = '';
  }
  const hasDiff = cleaned.trim().length > 0;

  // 3) Enforce mutually exclusive kinds
  if (hasOps && hasDiff) {
    const files = collectPatchedTargets(cleaned);
    const diag = composeInvalidFileOpsWithDiffEnvelope(opsPlan.ops, files);
    console.log(`stan: ${statusFail('patch failed')}`);
    console.log('');
    console.log(diag);
    return;
  }

  // 4) Persist raw payload (auditable; also covers FO-only)
  const stanPath = resolveStanPath(cwd);
  const patchDir = path.join(cwd, stanPath, 'patch');
  const patchAbs = path.join(patchDir, '.patch');
  try {
    await ensureDir(patchDir);
    await writeFile(patchAbs, raw, 'utf8');
  } catch {
    /* ignore persistence failures */
  }

  const check = Boolean(opts.check);

  // 5) File Ops only
  if (hasOps && !hasDiff) {
    try {
      const res = await executeFileOps(cwd, opsPlan.ops, check);
      const ok = Boolean(res.ok);
      if (ok) {
        const msg = check ? 'file ops check passed' : 'file ops applied';
        console.log(`stan: ${statusOk(msg)}`);
        console.log('');
        return;
      }
      const diag = composeFileOpsFailuresEnvelope(opsPlan.ops, res.results);
      console.log(
        `stan: ${statusFail(check ? 'file ops check failed' : 'file ops failed')}`,
      );
      console.log('');
      console.log(diag);
      return;
    } catch {
      console.log(
        `stan: ${statusFail(check ? 'file ops check failed' : 'file ops failed')}`,
      );
      console.log('');
      return;
    }
  }

  // 6) Diff only
  if (!hasOps && hasDiff) {
    // Enforce single-file diff rule
    const single = enforceSingleFileDiff(cleaned);
    if (!single.ok) {
      const diag = composeMultiFileInvalidEnvelope(single.files);
      console.log(`stan: ${statusFail('patch failed (multi-file diff)')}`);
      console.log('');
      console.log(diag);
      return;
    }
    const firstTarget = parseFirstTarget(cleaned);
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
        // Best-effort editor open (non-check)
        if (!check) {
          const cfg = (() => {
            try {
              const p = findConfigPathSync(cwd);
              return p ? loadConfigSync(cwd) : null;
            } catch {
              return null;
            }
          })();
          maybeOpenFiles(cwd, [single.target.path], cfg?.patchOpenCommand);
        }
        console.log('');
        return;
      }
      const diag = composeDiffFailureEnvelope(cleaned, {
        // Normalize shapes for the envelope composer (js: null -> undefined)
        result: out.result,
        js: out.js ?? undefined,
      });
      console.log(
        `stan: ${statusFail(check ? 'patch check failed' : 'patch failed')}`,
      );
      console.log('');
      console.log(diag);
      return;
    } catch {
      console.log(
        `stan: ${statusFail(check ? 'patch check failed' : 'patch failed')}`,
      );
      console.log('');
      return;
    }
  }

  // 7) Neither kind recognized
  console.log(`stan: ${statusFail('patch failed')} (no unified diff found)`);
};
