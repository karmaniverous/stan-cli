// src/cli/snap/options.ts
import { findConfigPathSync } from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import { Option as Opt } from 'commander';

import * as cliUtils from '@/cli/cli-utils';
import { loadCliConfigSync } from '@/cli/config/load';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';

type CliUtilsModule = typeof import('@/cli/cli-utils');
type TagDefaultFn = CliUtilsModule['tagDefault'];

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

  let tagDefaultResolved: TagDefaultFn | undefined;
  try {
    tagDefaultResolved = resolveNamedOrDefaultFunction<TagDefaultFn>(
      cliUtils as unknown,
      (m) => (m as CliUtilsModule).tagDefault,
      (m) => (m as { default?: Partial<CliUtilsModule> }).default?.tagDefault,
      'tagDefault',
    );
  } catch {
    tagDefaultResolved = undefined;
  }

  // Determine effective default from config (namespaced; legacy fallback).
  try {
    const p = findConfigPathSync(process.cwd());
    const cfg = p ? loadCliConfigSync(process.cwd()) : null;
    const stashDef = !!cfg?.cliDefaults?.snap?.stash;
    tagDefaultResolved?.(optStash, stashDef);
    tagDefaultResolved?.(optNoStash, !stashDef);
  } catch {
    // Built-in: no-stash default if config is unreadable
    tagDefaultResolved?.(optNoStash, true);
  }

  sub.addOption(optStash).addOption(optNoStash);
}
