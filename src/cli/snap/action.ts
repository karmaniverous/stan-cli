// src/cli/snap/action.ts
import {
  findConfigPathSync,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import type { Command } from 'commander';

import { loadCliConfigSync } from '@/cli/config/load';
import { printHeader } from '@/cli/header';
import { parseText } from '@/common/config/parse';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';

import { loadSnapHandler } from './handlers';

/** Guard: print header, check for loop reversal, update state. */
const runLoopHeaderAndGuard = async (
  cwd: string,
  stanPath: string,
): Promise<boolean> => {
  try {
    const st = await readLoopState(cwd, stanPath);
    printHeader('snap', st?.last ?? null);
    if (st?.last && isBackward(st.last, 'snap')) {
      const proceed = await confirmLoopReversal();
      if (!proceed) {
        console.log('');
        return false;
      }
    }
    await writeLoopState(cwd, stanPath, 'snap', new Date().toISOString());
  } catch {
    /* ignore guard failures */
  }
  return true;
};

/** Resolve stash default (flags > cliDefaults > legacy parse fallback). */
const resolveStashDefault = (
  sub: Command,
  opts: { stash?: boolean } | undefined,
): boolean | undefined => {
  try {
    const holder = sub as unknown as {
      getOptionValueSource?: (name: string) => string | undefined;
    };
    const fromCli = holder.getOptionValueSource?.('stash') === 'cli';
    if (fromCli) return opts?.stash === true;
  } catch {
    /* ignore */
  }
  // Namespaced loader (accepts transitional legacy via env guard internally)
  try {
    const cfg = loadCliConfigSync(process.cwd());
    if (typeof cfg.cliDefaults?.snap?.stash === 'boolean')
      return cfg.cliDefaults.snap.stash;
  } catch {
    /* ignore */
  }
  // Manual legacy fallback (namespaced first; then root)
  try {
    const cfgPath = findConfigPathSync(process.cwd());
    if (cfgPath) {
      const { readFileSync } = require('node:fs') as {
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
    const proceed = await runLoopHeaderAndGuard(cwd, stanPath);
    if (!proceed) return;

    // Flags > cliDefaults > legacy parse fallback
    const stashFinal = resolveStashDefault(sub, opts);
    const run = await loadSnapHandler('handleSnap');

    if (stashFinal === true) {
      console.log('stan: stash saved changes');
    }
    await run({ stash: stashFinal === true });
    if (stashFinal === true) {
      console.log('stan: stash pop restored changes');
    }
  });
}
