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
import { parseText } from '@/common/config/parse';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';

// Lazy, SSR-robust handler loader from concrete modules (avoid barrel import)
type SnapRunModule = typeof import('@/runner/snap/snap-run');
type HistoryModule = typeof import('@/runner/snap/history');
type HandleSnapFn = SnapRunModule['handleSnap'];
type HandleUndoFn = HistoryModule['handleUndo'];
type HandleRedoFn = HistoryModule['handleRedo'];
type HandleSetFn = HistoryModule['handleSet'];
type HandleInfoFn = HistoryModule['handleInfo'];

async function loadSnapHandler(
  name: 'handleSnap' | 'handleUndo' | 'handleRedo' | 'handleSet' | 'handleInfo',
): Promise<(...args: unknown[]) => Promise<void>> {
  if (name === 'handleSnap') {
    const mod = (await import('@/runner/snap/snap-run')) as unknown;
    try {
      const fn = resolveNamedOrDefaultFunction<HandleSnapFn>(
        mod,
        (m) => (m as SnapRunModule).handleSnap,
        (m) => (m as { default?: Partial<SnapRunModule> }).default?.handleSnap,
        'handleSnap',
      );
      return fn as (...a: unknown[]) => Promise<void>;
    } catch (e) {
      // Fallbacks for SSR/bundler export shapes:
      // 1) default export is a callable function
      try {
        const d = (mod as { default?: unknown }).default;
        if (typeof d === 'function') {
          return d as (...a: unknown[]) => Promise<void>;
        }
      } catch {
        /* ignore */
      }
      // 2) default export is an object exposing handleSnap
      try {
        const dh = (mod as { default?: { handleSnap?: unknown } }).default
          ?.handleSnap;
        if (typeof dh === 'function') {
          return dh as (...a: unknown[]) => Promise<void>;
        }
      } catch {
        /* ignore */
      }
      // Fallback: attempt the barrel in case SSR/test bundling reshaped exports.
      try {
        const barrel = (await import('@/runner/snap')) as unknown as {
          handleSnap?: unknown;
          default?:
            | { handleSnap?: unknown }
            | ((...a: unknown[]) => Promise<void>);
        };
        const viaNamed = (barrel as { handleSnap?: unknown }).handleSnap;
        const defMaybe = (barrel as { default?: { handleSnap?: unknown } })
          .default;
        const viaDefaultObj =
          defMaybe && typeof defMaybe === 'object'
            ? defMaybe.handleSnap
            : undefined;
        const viaDefaultFn =
          typeof (barrel as { default?: unknown }).default === 'function'
            ? ((barrel as { default?: (...a: unknown[]) => Promise<void> })
                .default as (...a: unknown[]) => Promise<void>)
            : undefined;
        const resolved =
          (typeof viaNamed === 'function'
            ? (viaNamed as (...a: unknown[]) => Promise<void>)
            : undefined) ??
          (typeof viaDefaultObj === 'function'
            ? (viaDefaultObj as (...a: unknown[]) => Promise<void>)
            : undefined) ??
          viaDefaultFn;
        if (resolved) return resolved;
      } catch {
        /* swallow and rethrow original */
      }
      throw e;
    }
  }
  // history variants
  const mod = (await import('@/runner/snap/history')) as unknown;
  if (name === 'handleUndo') {
    const fn = resolveNamedOrDefaultFunction<HandleUndoFn>(
      mod,
      (m) => (m as HistoryModule).handleUndo,
      (m) => (m as { default?: Partial<HistoryModule> }).default?.handleUndo,
      'handleUndo',
    );
    return fn as (...a: unknown[]) => Promise<void>;
  }
  if (name === 'handleRedo') {
    const fn = resolveNamedOrDefaultFunction<HandleRedoFn>(
      mod,
      (m) => (m as HistoryModule).handleRedo,
      (m) => (m as { default?: Partial<HistoryModule> }).default?.handleRedo,
      'handleRedo',
    );
    return fn as (...a: unknown[]) => Promise<void>;
  }
  if (name === 'handleSet') {
    const fn = resolveNamedOrDefaultFunction<HandleSetFn>(
      mod,
      (m) => (m as HistoryModule).handleSet,
      (m) => (m as { default?: Partial<HistoryModule> }).default?.handleSet,
      'handleSet',
    );
    return fn as (...a: unknown[]) => Promise<void>;
  }
  // handleInfo
  const fn = resolveNamedOrDefaultFunction<HandleInfoFn>(
    mod,
    (m) => (m as HistoryModule).handleInfo,
    (m) => (m as { default?: Partial<HistoryModule> }).default?.handleInfo,
    'handleInfo',
  );
  return fn as (...a: unknown[]) => Promise<void>;
}

import * as cliUtils from './cli-utils';
type CliUtilsModule = typeof import('./cli-utils');
type ApplyCliSafetyFn = CliUtilsModule['applyCliSafety'];
type TagDefaultFn = CliUtilsModule['tagDefault'];

/** * Register the `snap` subcommand on the provided root CLI.
 * * @param cli - Commander root command.
 * @returns The same root command for chaining. */
export function registerSnap(cli: Commander): Command {
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
  // Final safety (idempotent): ensure normalization/exit override on root
  try {
    (
      cliUtils as unknown as {
        patchParseMethods?: (c: Command) => void;
        installExitOverride?: (c: Command) => void;
      }
    ).patchParseMethods?.(cli);
    (
      cliUtils as unknown as { installExitOverride?: (c: Command) => void }
    ).installExitOverride?.(cli);
  } catch {
    /* best‑effort */
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

  // Final safety on subcommand as well (idempotent).
  try {
    (
      cliUtils as unknown as {
        patchParseMethods?: (c: Command) => void;
        installExitOverride?: (c: Command) => void;
      }
    ).patchParseMethods?.(sub as unknown as Command);
    (
      cliUtils as unknown as {
        installExitOverride?: (c: Command) => void;
      }
    ).installExitOverride?.(sub as unknown as Command);
  } catch {
    /* best‑effort */
  }

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
      await fn(indexArg);
    });

  sub
    .command('info')
    .description('Print the snapshot stack and current position')
    .action(async () => {
      const fn = await loadSnapHandler('handleInfo');
      await fn();
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
    const stashDef = !!cfg?.cliDefaults?.snap?.stash;
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
        if (fromCli) stashFinal = opts?.stash === true;
        else {
          // Transitional: accept legacy root-level cliDefaults when present by
          // temporarily enabling STAN_ACCEPT_LEGACY for this read.
          let cliCfg: ReturnType<typeof loadCliConfigSync> | undefined;
          const had = Object.prototype.hasOwnProperty.call(
            process.env,
            'STAN_ACCEPT_LEGACY',
          );
          const prev = process.env.STAN_ACCEPT_LEGACY;
          try {
            if (!had) process.env.STAN_ACCEPT_LEGACY = '1';
            cliCfg = loadCliConfigSync(process.cwd());
          } finally {
            if (!had) delete process.env.STAN_ACCEPT_LEGACY;
            else process.env.STAN_ACCEPT_LEGACY = prev;
          }
          if (cliCfg && typeof cliCfg.cliDefaults?.snap?.stash === 'boolean') {
            stashFinal = cliCfg.cliDefaults.snap.stash;
          }
        }
      } catch {
        /* ignore */
      }
      // Manual parsing fallback (namespaced or legacy root) when above failed
      if (typeof stashFinal === 'undefined') {
        try {
          const cfgPath = findConfigPathSync(process.cwd());
          if (cfgPath) {
            const { readFileSync } = await import('node:fs');
            const raw = readFileSync(cfgPath, 'utf8');
            const rootUnknown = parseText(cfgPath, raw);
            if (rootUnknown && typeof rootUnknown === 'object') {
              const root = rootUnknown as Record<string, unknown>;
              // Prefer namespaced stan-cli.cliDefaults.snap.stash
              const cliNs =
                root['stan-cli'] && typeof root['stan-cli'] === 'object'
                  ? (root['stan-cli'] as Record<string, unknown>)
                  : null;
              let val: unknown;
              if (cliNs) {
                val = (
                  cliNs as { cliDefaults?: { snap?: { stash?: unknown } } }
                ).cliDefaults?.snap?.stash;
              }
              // Legacy root fallback
              if (typeof val === 'undefined') {
                val = (root as { cliDefaults?: { snap?: { stash?: unknown } } })
                  .cliDefaults?.snap?.stash;
              }
              if (typeof val === 'boolean') stashFinal = val;
            }
          }
        } catch {
          /* ignore */
        }
      }
      const fn = await loadSnapHandler('handleSnap');
      // Emit concise confirmations so tests can assert stash behavior.
      if (stashFinal === true) {
        console.log('stan: stash saved changes');
      }
      await fn({ stash: stashFinal === true });
      if (stashFinal === true) {
        console.log('stan: stash pop restored changes');
      }
    });

  return cli;
}
