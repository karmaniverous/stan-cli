/** src/cli/snap/index.ts
 * Snap CLI — thin registry that composes safety, options, subcommands, and action.
 */
import type { Command } from 'commander';
import { Command as Commander } from 'commander';

import {
  handleInfo,
  handleRedo,
  handleSet,
  handleUndo,
} from '@/runner/snap/history';

import { applyCliSafety } from '../cli-utils';
import { registerSnapAction } from './action';
import { attachSnapOptions } from './options';

/**
 * Register the `snap` subcommand on the provided root CLI.
 *
 * Idempotently applies CLI safety to both root and subcommands and wires
 * history helpers (undo/redo/set/info) via lazy SSR‑robust resolvers.
 */
export function registerSnap(cli: Commander): Command {
  // Root safety (idempotent)
  applyCliSafety(cli);

  const sub = cli
    .command('snap')
    .description(
      'Create/update the diff snapshot (without writing an archive)',
    );

  // Sub safety (idempotent)
  applyCliSafety(sub as unknown as Command);

  // History helpers (lazy-resolved)
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

  // Stash flags and default tagging
  attachSnapOptions(sub);

  // Main action (stash + capture)
  registerSnapAction(sub);

  return cli;
}
