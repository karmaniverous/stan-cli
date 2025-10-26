/** src/cli/stan/patch.ts
 * CLI adapter for "stan patch" — Commander wiring only.
 */
import {
  findConfigPathSync,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import { Command, Option } from 'commander';

import { loadCliConfigSync } from '@/cli/config/load';
import { printHeader } from '@/cli/header';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';
import { runPatch } from '@/runner/patch/service';

// Robustly resolve applyCliSafety from named or default export to tolerate SSR/CJS interop.
import * as cliUtils from './cli-utils';
const resolveApplyCliSafety = (): ((c: Command) => void) | undefined => {
  const mod = cliUtils as unknown as {
    applyCliSafety?: unknown;
    default?: { applyCliSafety?: unknown };
  };
  const fn =
    typeof mod.applyCliSafety === 'function'
      ? (mod.applyCliSafety as (c: Command) => void)
      : typeof mod.default?.applyCliSafety === 'function'
        ? (mod.default.applyCliSafety as (c: Command) => void)
        : undefined;
  return fn;
};

/**
 * Register the `patch` subcommand on the provided root CLI. *
 * @param cli - Commander root command. * @returns The same root command for chaining.
 */
export const registerPatch = (cli: Command): Command => {
  // Best‑effort: do not throw if resolution fails in a mocked/SSR environment.
  resolveApplyCliSafety()?.(cli);

  const sub = cli
    .command('patch')
    .description(
      'Apply a git patch from clipboard (default), a file (-f), or argument.',
    )
    .argument('[input]', 'Patch data (unified diff)');

  // Build -f option and append default file path from config when present
  const optFile = new Option(
    '-f, --file [filename]',
    'Read patch from file as source',
  );
  try {
    const p = findConfigPathSync(process.cwd());
    if (p) {
      const cfg = loadCliConfigSync(process.cwd());
      const df = cfg.cliDefaults?.patch?.file;
      if (typeof df === 'string' && df.trim().length > 0) {
        optFile.description = `${optFile.description} (DEFAULT: ${df.trim()})`;
      }
    }
  } catch {
    // best-effort
  }

  sub
    .addOption(optFile)
    .addOption(
      new Option(
        '-F, --no-file',
        'Ignore configured default patch file (use clipboard unless input/-f provided)',
      ),
    )
    .option('-c, --check', 'Validate patch without applying any changes');
  resolveApplyCliSafety()?.(sub);

  sub.action(
    async (
      inputMaybe?: string,
      opts?: { file?: string | boolean; check?: boolean; noFile?: boolean },
    ) => {
      // Header + reversal guard + state update
      try {
        const cwd = process.cwd();
        // Resolve stanPath robustly even when engine config is missing/strict.
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

      // Resolve default patch file from CLI config (cliDefaults.patch.file)
      let defaultFile: string | undefined;
      try {
        const cwd = process.cwd();
        const p = findConfigPathSync(cwd);
        if (p) {
          const cliCfg = loadCliConfigSync(cwd);
          const fromCfg = cliCfg.cliDefaults?.patch?.file;
          if (typeof fromCfg === 'string' && fromCfg.trim().length > 0) {
            defaultFile = fromCfg.trim();
          }
        }
      } catch {
        // best-effort
      }

      await runPatch(process.cwd(), inputMaybe, {
        file: opts?.file,
        check: opts?.check,
        defaultFile,
        noFile: Boolean(opts?.noFile),
      });
    },
  );

  return cli;
};
