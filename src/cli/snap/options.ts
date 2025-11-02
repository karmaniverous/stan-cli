// src/cli/snap/options.ts
import { findConfigPathSync } from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import { Option as Opt } from 'commander';

import { tagDefault } from '@/cli/cli-utils';
import { loadCliConfigSync } from '@/cli/config/load';

/** Add -s/--stash and -S/--no-stash with effective defaults tagged in help. */
export function attachSnapOptions(sub: Command): void {
  const optStash = new Opt(
    '-s, --stash',
    'stash changes (git stash -u) before snap and pop after',
  );
  const optNoStash = new Opt(
    '-S, --no-stash',
    'do not stash before snapshot (negated form)',
  );

  // Determine effective default from config (namespaced; legacy fallback).
  try {
    const p = findConfigPathSync(process.cwd());
    const cfg = p ? loadCliConfigSync(process.cwd()) : null;
    const stashDef = !!cfg?.cliDefaults?.snap?.stash;
    tagDefault(optStash, stashDef);
    tagDefault(optNoStash, !stashDef);
  } catch {
    // Built-in: no-stash default if config is unreadable
    tagDefault(optNoStash, true);
  }

  sub.addOption(optStash).addOption(optNoStash);
}
