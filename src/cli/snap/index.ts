/** src/cli/snap/index.ts
 * Snap CLI — thin registry that composes safety, options, subcommands, and action.
 */
import type { Command } from 'commander';
import { Command as Commander } from 'commander';

// SSR‑robust resolver (named or default) to avoid module‑shape issues in tests
import * as snapActionMod from './action';
import { loadSnapHandler } from './handlers';
import { attachSnapOptions } from './options';
import { applyCliSafetyTo } from './safety';

const tryResolveNamedOrDefault = <F>(
  mod: unknown,
  pickNamed: (m: unknown) => F | undefined,
  pickDefault: (m: unknown) => F | undefined,
  label?: string,
): F => {
  // 1) named export
  try {
    const named = pickNamed(mod);
    if (typeof named === 'function') return named as F;
  } catch {
    /* ignore */
  }
  // 2) default.registerX
  try {
    const viaDefault = pickDefault(mod);
    if (typeof viaDefault === 'function') return viaDefault as F;
  } catch {
    /* ignore */
  }
  // 3) function-as-default (common in SSR/tests)
  try {
    const defAny = (mod as { default?: unknown }).default;
    if (typeof defAny === 'function') return defAny as unknown as F;
  } catch {
    /* ignore */
  }
  const what = label && label.trim().length ? label.trim() : 'export';
  throw new Error(`${what} not found`);
};

type ActionModule = typeof import('./action');
const getRegisterSnapAction = (): ActionModule['registerSnapAction'] => {
  const mod = snapActionMod as unknown;
  // named
  const named = (mod as ActionModule).registerSnapAction as unknown;
  if (typeof named === 'function')
    return named as ActionModule['registerSnapAction'];
  // default.registerSnapAction
  const viaDefault = (mod as { default?: Partial<ActionModule> }).default
    ?.registerSnapAction as unknown;
  if (typeof viaDefault === 'function')
    return viaDefault as ActionModule['registerSnapAction'];
  // default as function
  const defAny = (mod as { default?: unknown }).default;
  if (typeof defAny === 'function')
    return defAny as unknown as ActionModule['registerSnapAction'];
  throw new Error('registerSnapAction not found');
};

/**
 * Register the `snap` subcommand on the provided root CLI.
 *
 * Idempotently applies CLI safety to both root and subcommands and wires
 * history helpers (undo/redo/set/info) via lazy SSR‑robust resolvers.
 */
export function registerSnap(cli: Commander): Command {
  // Root safety (idempotent)
  applyCliSafetyTo(cli);

  const sub = cli
    .command('snap')
    .description(
      'Create/update the diff snapshot (without writing an archive)',
    );

  // Sub safety (idempotent)
  applyCliSafetyTo(sub as unknown as Command);

  // History helpers (lazy-resolved)
  sub
    .command('undo')
    .description('Revert to the previous snapshot in the history stack')
    .action(async () => {
      const fn = await loadSnapHandler('handleUndo');
      await fn();
    });

  sub
    .command('redo')
    .description('Advance to the next snapshot in the history stack')
    .action(async () => {
      const fn = await loadSnapHandler('handleRedo');
      await fn();
    });

  sub
    .command('set')
    .argument('<index>', 'snapshot index to activate (0-based)')
    .description('Jump to a specific snapshot index and restore it')
    .action(async (indexArg: string) => {
      const fn = await loadSnapHandler('handleSet');
      // Preserve raw CLI string to retain expected 0-based semantics in history.
      await fn(indexArg);
    });

  sub
    .command('info')
    .description('Print the snapshot stack and current position')
    .action(async () => {
      const fn = await loadSnapHandler('handleInfo');
      await fn();
    });

  // Stash flags and default tagging
  attachSnapOptions(sub);

  // Main action (stash + capture)
  {
    const registerSnapAction = getRegisterSnapAction();
    registerSnapAction(sub);
  }

  return cli;
}
