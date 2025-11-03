import {
  findConfigPathSync,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import type { Command } from 'commander';

import { getOptionSource, snapDefaults } from '@/cli/cli-utils';
import { loadCliConfigSync } from '@/cli/config/load';
import { snapLoopHeaderAndGuard } from '@/cli/run/action/loop';
import { parseText } from '@/common/config/parse';
import { handleSnap } from '@/runner/snap';

/** Guard: print header, check for loop reversal, update state. */
// moved to src/cli/run/action/loop.ts; reused here

/** Resolve stash default (flags \> cliDefaults \> legacy parse fallback). */
const resolveStashDefault = async (
  sub: Command,
  opts: { stash?: boolean } | undefined,
): Promise<boolean | undefined> => {
  // CLI flag wins
  if (getOptionSource(sub, 'stash') === 'cli') {
    return opts?.stash === true;
  }
  // Namespaced loader (accepts transitional legacy via env guard internally)
  try {
    const cfg = loadCliConfigSync(process.cwd());
    if (typeof cfg.cliDefaults?.snap?.stash === 'boolean')
      return cfg.cliDefaults.snap.stash;
  } catch {
    /* ignore */
  }
  // Centralized helper (best-effort)
  try {
    const eff = snapDefaults(process.cwd());
    if (typeof eff?.stash === 'boolean') return eff.stash;
  } catch {
    /* ignore */
  }
  // Manual legacy fallback (namespaced first; then root)
  try {
    const cfgPath = findConfigPathSync(process.cwd());
    if (cfgPath) {
      const { readFileSync } = (await import('node:fs')) as unknown as {
        readFileSync: (p: string, e: string) => string;
      };
      const raw = readFileSync(cfgPath, 'utf8');
      const rootUnknown = parseText(cfgPath, raw);
      if (rootUnknown && typeof rootUnknown === 'object') {
        const root = rootUnknown as Record<string, unknown>;
        const cliNs =
          root['stan-cli'] && typeof root['stan-cli'] === 'object'
            ? (root['stan-cli'] as Record<string, unknown>)
            : null;
        let val: unknown;
        if (cliNs) {
          val = (cliNs as { cliDefaults?: { snap?: { stash?: unknown } } })
            .cliDefaults?.snap?.stash;
        }
        if (typeof val === 'undefined') {
          val = (root as { cliDefaults?: { snap?: { stash?: unknown } } })
            .cliDefaults?.snap?.stash;
        }
        if (typeof val === 'boolean') return val;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
};

/** Wire the main snap action: stash flow + capture handler. */
export function registerSnapAction(sub: Command): void {
  sub.action(async (opts?: { stash?: boolean }) => {
    const cwd = process.cwd();
    // Resolve stanPath robustly even when engine config is strict/missing.
    let stanPath = '.stan';
    try {
      stanPath = resolveStanPathSync(cwd);
    } catch {
      /* keep default */
    }
    // Header + reversal guard + state update
    const proceed = await snapLoopHeaderAndGuard(cwd, stanPath);
    if (!proceed) return;

    // Flags > cliDefaults > legacy parse fallback
    const stashFinal = await resolveStashDefault(sub, opts);

    if (stashFinal === true) {
      console.log('stan: stash saved changes');
    }
    await handleSnap({ stash: stashFinal === true });
    if (stashFinal === true) {
      console.log('stan: stash pop restored changes');
    }
  });
}
