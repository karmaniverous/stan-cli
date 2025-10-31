/** src/stan/patch/service.ts
 * CLI-facing patch orchestrator.
 * - Acquire raw patch from argument/file/default/clipboard (input.ts).
 * - Robustly classify patch kind (File Ops vs Diff): only treat as Diff when unified-diff headers are present.
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
  loadConfig,
  parseFileOpsBlock,
} from '@karmaniverous/stan-core';
import { DEFAULT_OPEN_COMMAND } from '@karmaniverous/stan-core';
import clipboardy from 'clipboardy';
import { ensureDir } from 'fs-extra';

import { loadCliConfigSync } from '@/cli/config/load';
import {
  composeDiffFailureEnvelope,
  composeFileOpsFailuresEnvelope,
  composeInvalidFileOpsWithDiffEnvelope,
  composeMultiFileInvalidEnvelope,
} from '@/runner/patch/diagnostics';
import {
  collectPatchedTargets,
  enforceSingleFileDiff,
  parseFirstTarget,
} from '@/runner/patch/diff';
import { maybeOpenFiles } from '@/runner/patch/editor';
import { readPatchSource } from '@/runner/patch/input';
import { statusFail, statusOk } from '@/runner/patch/status';

export type RunPatchOptions = {
  file?: string | boolean;
  defaultFile?: string;
  noFile?: boolean;
  check?: boolean;
};

/** Resolve editor command once (best‑effort). */
const getPatchOpenCommand = (cwd: string): string | undefined => {
  try {
    const p = findConfigPathSync(cwd);
    if (!p) return DEFAULT_OPEN_COMMAND;
    const cli = loadCliConfigSync(cwd);
    return typeof cli.patchOpenCommand === 'string' &&
      cli.patchOpenCommand.length > 0
      ? cli.patchOpenCommand
      : DEFAULT_OPEN_COMMAND;
  } catch {
    return DEFAULT_OPEN_COMMAND;
  }
};

/** Best‑effort: open target file in editor for non‑check runs. */
const openTargetIfNeeded = (
  cwd: string,
  file: string | undefined,
  check: boolean,
): void => {
  if (!file || check) return;
  const cmd = getPatchOpenCommand(cwd);
  try {
    maybeOpenFiles(cwd, [file], cmd);
  } catch {
    /* ignore */
  }
};

/** Copy diagnostics to clipboard and print a single instruction line. */
const reportDiagnostics = async (diag: string): Promise<void> => {
  try {
    await clipboardy.write(diag);
  } catch {
    /* ignore clipboard errors */
  }
  console.log(
    'stan: diagnostics copied to clipboard. Paste into chat for a full listing.',
  );
};

/** Print exactly one trailing blank line at the end of the command logs. */
const finalizeLogs = (): void => {
  console.log('');
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
    finalizeLogs();
    return;
  }
  console.log(`stan: patch source: ${source}`);

  // 2) Classify kind (File Ops vs Diff)
  const opsPlan = parseFileOpsBlock(raw);
  const hasOps = opsPlan.ops.length > 0;
  let cleaned = '';
  try {
    cleaned = detectAndCleanPatch(raw);
  } catch {
    cleaned = '';
  }
  // Robust diff detection: treat as a diff only when unified-diff headers are present.
  const hasDiff = (() => {
    try {
      return collectPatchedTargets(cleaned).length > 0;
    } catch {
      return false;
    }
  })();

  // 3) Enforce mutually exclusive kinds
  if (hasOps && hasDiff) {
    const files = collectPatchedTargets(cleaned);
    const diag = composeInvalidFileOpsWithDiffEnvelope(opsPlan.ops, files);
    console.log(`stan: ${statusFail('patch failed')}`);
    await reportDiagnostics(diag);
    finalizeLogs();
    return;
  }

  // Resolve stanPath (best-effort for persistence)
  let stanPath = '.stan';
  try {
    const cfg = await loadConfig(cwd);
    stanPath = cfg.stanPath;
  } catch {
    stanPath = '.stan';
  }

  // 4) Persist raw payload (auditable; also covers FO-only)
  const patchDir = path.join(cwd, stanPath, 'patch');
  const patchAbs = path.join(patchDir, '.patch');
  try {
    await ensureDir(patchDir);
    await writeFile(patchAbs, raw, 'utf8');
  } catch {
    /* ignore persistence failures */
  }

  const check = opts.check === true;

  // 5) File Ops only
  if (hasOps && !hasDiff) {
    try {
      const res = await executeFileOps(cwd, opsPlan.ops, check);
      const ok = res.ok;
      if (ok) {
        const msg = check ? 'file ops check passed' : 'file ops applied';
        console.log(`stan: ${statusOk(msg)}`);
        finalizeLogs();
        return;
      }
      const diag = composeFileOpsFailuresEnvelope(opsPlan.ops, res.results);
      console.log(
        `stan: ${statusFail(check ? 'file ops check failed' : 'file ops failed')}`,
      );
      await reportDiagnostics(diag);
      finalizeLogs();
      return;
    } catch {
      console.log(
        `stan: ${statusFail(check ? 'file ops check failed' : 'file ops failed')}`,
      );
      finalizeLogs();
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
      await reportDiagnostics(diag);
      finalizeLogs();
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
        openTargetIfNeeded(cwd, single.target.path, check);
        finalizeLogs();
        return;
      }
      const diag = composeDiffFailureEnvelope(cleaned, {
        // Normalize shapes for the envelope composer (js: null -> undefined)
        result: out.result,
        js:
          out.js === null
            ? (undefined as unknown as {
                failed?: Array<{ path?: string; reason?: string }>;
              })
            : out.js,
      });
      console.log(
        `stan: ${statusFail(check ? 'patch check failed' : 'patch failed')}`,
      );
      await reportDiagnostics(diag);
      // Open the target file on failure as well (best-effort; non-check).
      openTargetIfNeeded(cwd, single.target.path, check);
      finalizeLogs();
      return;
    } catch {
      console.log(
        `stan: ${statusFail(check ? 'patch check failed' : 'patch failed')}`,
      );
      // Even on unexpected errors, attempt to open the target (non-check).
      openTargetIfNeeded(cwd, single.target.path, check);
      finalizeLogs();
      return;
    }
  }

  // 7) Neither kind recognized
  console.log(`stan: ${statusFail('patch failed')} (no unified diff found)`);
  finalizeLogs();
};
