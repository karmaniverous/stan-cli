/** src/cli/patch/register.ts
 * CLI adapter for "stan patch" — Commander wiring with SSR/test‑robust apply.
 *
 * Notes:
 * - Local unified‑diff path: tries "./apply".runGitApply; falls back to jsdiff
 *   from \@karmaniverous/stan-core (preserves EOLs).
 * - Non‑diff or mixed inputs: delegate to the service pipeline.
 */
import {
  detectAndCleanPatch,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import { Command as Commander, Option } from 'commander';

import { printHeader } from '@/cli/header';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';
import { runPatch } from '@/runner/patch/service';
import { statusOk } from '@/runner/patch/status';

import { applyCliSafety, patchDefaultFile } from '../cli-utils';
import { applyUnifiedDiffLocally } from './apply-local';
import { looksLikeUnifiedDiff } from './detect';
import { readRawFromArgOrFile } from './input';

/** Register the `patch` subcommand on the provided root CLI. */
export function registerPatch(cli: Commander): Command {
  // Root safety (idempotent)
  applyCliSafety(cli);

  const sub = cli
    .command('patch')
    .description(
      'Apply a git patch from clipboard (default), a file (-f), or argument.',
    )
    .argument('[input]', 'Patch data (unified diff)');

  // Compute DEFAULT suffix for -f from config up-front, then construct the option
  let defaultSuffix = '';
  try {
    const df = patchDefaultFile(process.cwd());
    if (df) defaultSuffix = ` (DEFAULT: ${df})`;
  } catch {
    /* best-effort */
  }
  const optFile = new Option(
    '-f, --file [filename]',
    `Read patch from file as source${defaultSuffix}`,
  );

  sub
    .addOption(optFile)
    .addOption(
      new Option(
        '-F, --no-file',
        'Ignore configured default patch file (use clipboard unless input/-f provided)',
      ),
    )
    .option('-c, --check', 'Validate patch without applying any changes');

  // Sub safety
  applyCliSafety(sub);

  sub.action(
    async (
      inputMaybe?: string,
      opts?: { file?: string | boolean; check?: boolean; noFile?: boolean },
    ) => {
      // Header + reversal guard + state update
      try {
        const cwd = process.cwd();
        let stanPath = '.stan';
        try {
          stanPath = resolveStanPathSync(cwd);
        } catch {
          /* keep default */
        }
        const st = await readLoopState(cwd, stanPath).catch(() => null);
        printHeader('patch', st?.last ?? null);
        if (st?.last && isBackward(st.last, 'patch')) {
          const proceed = await confirmLoopReversal();
          if (!proceed) {
            console.log('');
            return;
          }
        }
        await writeLoopState(cwd, stanPath, 'patch', new Date().toISOString());
      } catch {
        /* ignore guard failures */
      }

      const cwd = process.cwd();

      // Resolve raw input: argument > -f file > default file (when allowed) > clipboard (service path)
      let raw = '';
      let source = 'clipboard';
      const cfgPath = findConfigPathSync(cwd);
      let defaultFile: string | undefined;
      try {
        if (cfgPath) {
          const cfg = loadCliConfigSync(cwd);
          const df = cfg.cliDefaults?.patch?.file;
          if (typeof df === 'string' && df.trim().length && !opts?.noFile) {
            defaultFile = df.trim();
          }
        }
      } catch {
        /* ignore */
      }

      try {
        const preferFile =
          typeof opts?.file === 'string' && opts.file.trim().length
            ? opts.file.trim()
            : defaultFile;
        const got = await readRawFromArgOrFile(inputMaybe, preferFile);
        raw = got.raw;
        source = got.source;
      } catch {
        // fall through with empty raw; service may try clipboard
      }
      console.log(`stan: patch source: ${source}`);

      // Decide path:
      // - If we have a probable unified diff body, handle locally (shim + jsdiff).
      // - Otherwise, delegate to the service (File Ops, clipboard/default-file flows, diagnostics).
      const isDiff = looksLikeUnifiedDiff(raw);
      const cleaned = ((): string => {
        try {
          return isDiff ? detectAndCleanPatch(raw) : '';
        } catch {
          return '';
        }
      })();

      if (isDiff && cleaned.trim().length > 0) {
        const { ok, firstTarget } = await applyUnifiedDiffLocally(
          cwd,
          cleaned,
          Boolean(opts?.check),
        );
        if (ok) {
          const tail = firstTarget ? ` -> ${firstTarget}` : '';
          const msg = opts?.check ? 'patch check passed' : 'patch applied';
          console.log(`stan: ${statusOk(msg)}${tail}`);
          console.log('');
          return;
        }
        // Local attempt failed; fall through to service for diagnostics/clipboard fallback.
      }

      // Delegate to the service (robust classification: File Ops, clipboard, diagnostics)
      await runPatch(cwd, raw || inputMaybe, {
        file: typeof opts?.file === 'string' ? opts.file : undefined,
        check: Boolean(opts?.check),
        defaultFile,
        noFile: Boolean(opts?.noFile),
      });
    },
  );

  return cli;
}
