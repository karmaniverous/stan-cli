// src/cli/snap/options.ts
import type { Command } from 'commander';
import { Option as Opt } from 'commander';

import { snapDefaults, tagDefault } from '../cli-utils';

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
  const eff = snapDefaults(process.cwd());
  const stashDef = eff?.stash === true;
  try {
    tagDefault(optStash, stashDef);
    tagDefault(optNoStash, !stashDef);
  } catch {
    /* best-effort */
  }

  sub.addOption(optStash).addOption(optNoStash);
}
