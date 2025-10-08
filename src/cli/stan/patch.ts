/** src/cli/stan/patch.ts
 * CLI adapter for "stan patch" — Commander wiring only.
 */
import readline from 'node:readline';

import { findConfigPathSync, loadConfigSync } from '@karmaniverous/stan-core';
import { Command, Option } from 'commander';

import { isBackward, readLoopState, writeLoopState } from '@/stan/loop/state';
import { runPatch } from '@/stan/patch/service';
import { go, warn } from '@/stan/util/color';

import { applyCliSafety } from './cli-utils';

/**
 * Register the `patch` subcommand on the provided root CLI.
 *
 * @param cli - Commander root command. * @returns The same root command for chaining.
 */
export const registerPatch = (cli: Command): Command => {
  applyCliSafety(cli);

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
      const cfg = loadConfigSync(process.cwd());
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
  applyCliSafety(sub);

  sub.action(
    async (
      inputMaybe?: string,
      opts?: { file?: string | boolean; check?: boolean; noFile?: boolean },
    ) => {
      const isTTY = Boolean(
        (process.stdout as unknown as { isTTY?: boolean })?.isTTY,
      );
      const isBoring = (): boolean =>
        process.env.STAN_BORING === '1' ||
        process.env.NO_COLOR === '1' ||
        process.env.FORCE_COLOR === '0' ||
        !isTTY;
      const header = (last: string | null): void => {
        const token = isBoring() ? '[GO] patch' : go('▶︎ patch');
        console.log(`stan: ${token} (last command: ${last ?? 'none'})`);
      };
      const confirmReversal = async (): Promise<boolean> => {
        if (!isTTY) return true;
        if (process.env.STAN_YES === '1') return true;
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const q = (s: string) =>
          new Promise<string>((res) => rl.question(s, (a) => res(a)));
        const token = isBoring() ? '[WARN]' : warn('⚠︎');
        const a = (
          await q(`stan: ${token} loop reversal detected! Continue? (Y/n) `)
        ).trim();
        rl.close();
        return a === '' || /^[yY]/.test(a);
      };

      // Header + reversal guard + state update
      try {
        const cwd = process.cwd();
        const p = findConfigPathSync(cwd);
        const cfg = p ? loadConfigSync(cwd) : null;
        const stanPath = cfg?.stanPath ?? '.stan';
        const st = await readLoopState(cwd, stanPath);
        header(st?.last ?? null);
        if (st?.last && isBackward(st.last, 'patch')) {
          const proceed = await confirmReversal();
          if (!proceed) {
            console.log('');
            return;
          }
        }
        await writeLoopState(cwd, stanPath, 'patch', new Date().toISOString());
      } catch {
        /* ignore guard failures */
      }

      // Resolve default patch file from config (opts.cliDefaults.patch.file)
      let defaultFile: string | undefined;
      try {
        const { loadConfigSync, findConfigPathSync } = await import(
          '@karmaniverous/stan-core'
        );
        const cwd = process.cwd();
        const p = findConfigPathSync(cwd);
        if (p) {
          const cfg = loadConfigSync(cwd);
          const fromCfg = cfg.cliDefaults?.patch?.file;
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
