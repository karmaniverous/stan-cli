/* src/cli/stan/snap.ts
 * CLI adapter for "stan snap" — Commander wiring only.
 */
import type { Command } from 'commander';
import { Command as Commander, Option } from 'commander';

import { findConfigPathSync, loadConfigSync } from '@/stan/config';
import {
  handleInfo,
  handleRedo,
  handleSet,
  handleUndo,
} from '@/stan/snap/history';
import { handleSnap } from '@/stan/snap/snap-run';

import { applyCliSafety, tagDefault } from './cli-utils';

/** * Register the `snap` subcommand on the provided root CLI.
 * * @param cli - Commander root command.
 * @returns The same root command for chaining.
 */ export const registerSnap = (cli: Commander): Command => {
  applyCliSafety(cli);
  const sub = cli
    .command('snap')
    .description(
      'Create/update the diff snapshot (without writing an archive)',
    );

  applyCliSafety(sub);

  sub
    .command('undo')
    .description('Revert to the previous snapshot in the history stack')
    .action(async () => {
      await handleUndo();
    });

  sub
    .command('redo')
    .description('Advance to the next snapshot in the history stack')
    .action(async () => {
      await handleRedo();
    });

  sub
    .command('set')
    .argument('<index>', 'snapshot index to activate (0-based)')
    .description('Jump to a specific snapshot index and restore it')
    .action(async (indexArg: string) => {
      await handleSet(indexArg);
    });

  sub
    .command('info')
    .description('Print the snapshot stack and current position')
    .action(async () => {
      await handleInfo();
    });

  // Stash flags with default tagging
  const optStash = new Option(
    '-s, --stash',
    'stash changes (git stash -u) before snap and pop after',
  );
  const optNoStash = new Option(
    '-S, --no-stash',
    'do not stash before snapshot (negated form)',
  );
  // Determine effective default (config overrides > built-ins)
  try {
    const p = findConfigPathSync(process.cwd());
    const cfg = p ? loadConfigSync(process.cwd()) : null;
    const stashDef = Boolean(cfg?.cliDefaults?.snap?.stash ?? false);
    tagDefault(stashDef ? optStash : optNoStash, true);
  } catch {
    // best-effort; built-in default is no-stash
    tagDefault(optNoStash, true);
  }

  sub
    .addOption(optStash)
    .addOption(optNoStash)
    .action(async (opts?: { stash?: boolean }) => {
      // Resolve default stash from config when flags omitted
      let stashFinal: boolean | undefined;
      try {
        const src = sub as unknown as {
          getOptionValueSource?: (name: string) => string | undefined;
        };
        const fromCli = src.getOptionValueSource?.('stash') === 'cli';
        if (fromCli) stashFinal = Boolean(opts?.stash);
        else {
          const p = findConfigPathSync(process.cwd());
          if (p) {
            const cfg = loadConfigSync(process.cwd());
            stashFinal = Boolean(cfg.cliDefaults?.snap?.stash ?? false);
          }
        }
      } catch {
        /* ignore */
      }
      await handleSnap({ stash: Boolean(stashFinal) });
    });

  return cli;
};
