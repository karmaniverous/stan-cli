/* src/cli/stan/snap.ts
 * CLI adapter for "stan snap" — Commander wiring only.
 */
import {
  findConfigPathSync,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import { Command as Commander, Option } from 'commander';

import { loadCliConfigSync } from '@/cli/config/load';
import { printHeader } from '@/cli/header';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';
import {
  handleInfo,
  handleRedo,
  handleSet,
  handleSnap,
  handleUndo,
} from '@/runner/snap';

import * as cliUtils from './cli-utils';
type CliUtilsModule = typeof import('./cli-utils');
type ApplyCliSafetyFn = CliUtilsModule['applyCliSafety'];
type TagDefaultFn = CliUtilsModule['tagDefault'];

/** * Register the `snap` subcommand on the provided root CLI.
 * * @param cli - Commander root command.
 * @returns The same root command for chaining. */
export const registerSnap = (cli: Commander): Command => {
  {
    let applied = false;
    try {
      const applyCliSafetyResolved: ApplyCliSafetyFn | undefined =
        resolveNamedOrDefaultFunction<ApplyCliSafetyFn>(
          cliUtils as unknown,
          (m) => (m as CliUtilsModule).applyCliSafety,
          (m) =>
            (m as { default?: Partial<CliUtilsModule> }).default
              ?.applyCliSafety,
          'applyCliSafety',
        );
      if (applyCliSafetyResolved) {
        applyCliSafetyResolved(cli);
        applied = true;
      }
    } catch {
      /* best-effort */
    }
    if (!applied) {
      try {
        (
          cliUtils as unknown as {
            installExitOverride?: (c: Command) => void;
            patchParseMethods?: (c: Command) => void;
          }
        ).installExitOverride?.(cli);
        (
          cliUtils as unknown as {
            patchParseMethods?: (c: Command) => void;
          }
        ).patchParseMethods?.(cli);
      } catch {
        /* best-effort */
      }
    }
  }
  const sub = cli
    .command('snap')
    .description(
      'Create/update the diff snapshot (without writing an archive)',
    );

  {
    let applied = false;
    try {
      const applyCliSafetySub: ApplyCliSafetyFn | undefined =
        resolveNamedOrDefaultFunction<ApplyCliSafetyFn>(
          cliUtils as unknown,
          (m) => (m as CliUtilsModule).applyCliSafety,
          (m) =>
            (m as { default?: Partial<CliUtilsModule> }).default
              ?.applyCliSafety,
          'applyCliSafety',
        );
      if (applyCliSafetySub) {
        applyCliSafetySub(sub);
        applied = true;
      }
    } catch {
      /* best-effort */
    }
    if (!applied) {
      try {
        (
          cliUtils as unknown as {
            installExitOverride?: (c: Command) => void;
            patchParseMethods?: (c: Command) => void;
          }
        ).installExitOverride?.(sub);
        (
          cliUtils as unknown as {
            patchParseMethods?: (c: Command) => void;
          }
        ).patchParseMethods?.(sub);
      } catch {
        /* best-effort */
      }
    }
  }

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

  // Resolve tagDefault lazily (named-or-default) to avoid SSR import-shape issues.
  const tagDefaultResolved: TagDefaultFn | undefined = (() => {
    try {
      return resolveNamedOrDefaultFunction<TagDefaultFn>(
        cliUtils as unknown,
        (m) => (m as CliUtilsModule).tagDefault,
        (m) => (m as { default?: Partial<CliUtilsModule> }).default?.tagDefault,
        'tagDefault',
      );
    } catch {
      return undefined;
    }
  })();

  // Determine effective default (config overrides > built-ins)
  try {
    const p = findConfigPathSync(process.cwd());
    const cfg = p ? loadCliConfigSync(process.cwd()) : null;
    const stashDef = Boolean(cfg?.cliDefaults?.snap?.stash ?? false);
    tagDefaultResolved?.(optStash, stashDef);
    tagDefaultResolved?.(optNoStash, !stashDef);
  } catch {
    // best-effort; built-in default is no-stash
    tagDefaultResolved?.(optNoStash, true);
  }

  sub
    .addOption(optStash)
    .addOption(optNoStash)
    .action(async (opts?: { stash?: boolean }) => {
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
        printHeader('snap', st?.last ?? null);
        if (st?.last && isBackward(st.last, 'snap')) {
          const proceed = await confirmLoopReversal();
          if (!proceed) {
            console.log('');
            return;
          }
        }
        await writeLoopState(cwd, stanPath, 'snap', new Date().toISOString());
      } catch {
        /* ignore guard failures */
      }
      // Resolve default stash from config when flags omitted
      let stashFinal: boolean | undefined;
      try {
        const src = sub as unknown as {
          getOptionValueSource?: (name: string) => string | undefined;
        };
        const fromCli = src.getOptionValueSource?.('stash') === 'cli';
        if (fromCli) stashFinal = Boolean(opts?.stash);
        else {
          const cli = loadCliConfigSync(process.cwd());
          stashFinal = Boolean(cli.cliDefaults?.snap?.stash ?? false);
        }
      } catch {
        /* ignore */
      }
      await handleSnap({ stash: Boolean(stashFinal) });
    });

  return cli;
};
