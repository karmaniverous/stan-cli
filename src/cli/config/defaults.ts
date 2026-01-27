/**
 * Config defaults derivation helpers.
 * Extracts values from configuration (with legacy fallbacks) to drive CLI defaults.
 */
import type { ContextConfig } from '@karmaniverous/stan-core';
import { findConfigPathSync, loadConfigSync } from '@karmaniverous/stan-core';

import { loadCliConfigSync } from '@/cli/config/load';
import { pickCliNode, readRawConfigSync } from '@/cli/config/raw';
import { RUN_BASE_DEFAULTS } from '@/cli/run/defaults';

const cwdSafe = (): string => {
  try {
    return process.cwd();
  } catch {
    return '.';
  }
};

/** Load engine config synchronously with best-effort safety (null on failure). */
export const loadConfigSafe = (dir = cwdSafe()): ContextConfig | null => {
  try {
    const p = findConfigPathSync(dir);
    return p ? loadConfigSync(dir) : null;
  } catch {
    return null;
  }
};

/** Root-level boolean defaults (debug/boring) from config or built-ins. */
export const readRootDefaultsFromConfig = (
  dir = cwdSafe(),
): { debugDefault: boolean; boringDefault: boolean; yesDefault: boolean } => {
  // Read from stan-cli only; fall back to built-ins when absent.
  let debugDefault = false;
  let boringDefault = false;
  let yesDefault = false;
  try {
    // Transitional: accept legacy top-level cliDefaults by temporarily enabling STAN_ACCEPT_LEGACY.
    const had = Object.prototype.hasOwnProperty.call(
      process.env,
      'STAN_ACCEPT_LEGACY',
    );
    const prev = process.env.STAN_ACCEPT_LEGACY;
    try {
      if (!had) process.env.STAN_ACCEPT_LEGACY = '1';
      const cli = loadCliConfigSync(dir).cliDefaults;
      debugDefault = cli?.debug ?? false;
      boringDefault = cli?.boring ?? false;
      // "yes" is not part of the canonical schema; keep a permissive read for transition.
      yesDefault = (cli as { yes?: boolean } | undefined)?.yes ?? false;
    } finally {
      if (!had) delete process.env.STAN_ACCEPT_LEGACY;
      else process.env.STAN_ACCEPT_LEGACY = prev;
    }
  } catch {
    // built-ins only
  }
  return { debugDefault, boringDefault, yesDefault };
};

/** Run-phase defaults merged from config over baseline RUN_BASE_DEFAULTS. */
export const runDefaults = (
  dir = cwdSafe(),
): {
  archive: boolean;
  combine: boolean;
  plan: boolean;
  keep: boolean;
  sequential: boolean;
  live: boolean;
  hangWarn: number;
  hangKill: number;
  hangKillGrace: number;
  prompt: string;
  facets: boolean;
  context: boolean;
} => {
  let runIn: {
    archive?: boolean;
    combine?: boolean;
    keep?: boolean;
    sequential?: boolean;
    live?: boolean;
    plan?: boolean;
    hangWarn?: number;
    hangKill?: number;
    hangKillGrace?: number;
    prompt?: string;
    facets?: boolean;
    context?: boolean;
  } = {};
  try {
    // Transitional: always accept legacy cliDefaults when present by
    // temporarily enabling STAN_ACCEPT_LEGACY during the sync load.
    const had = Object.prototype.hasOwnProperty.call(
      process.env,
      'STAN_ACCEPT_LEGACY',
    );
    const prev = process.env.STAN_ACCEPT_LEGACY;
    try {
      if (!had) process.env.STAN_ACCEPT_LEGACY = '1';
      runIn = (loadCliConfigSync(dir).cliDefaults?.run ?? {}) as typeof runIn;
    } finally {
      if (!had) delete process.env.STAN_ACCEPT_LEGACY;
      else process.env.STAN_ACCEPT_LEGACY = prev;
    }
  } catch {
    // keep empty; use baselines
  }
  type BoolKeys =
    | 'archive'
    | 'combine'
    | 'keep'
    | 'sequential'
    | 'live'
    | 'context';
  const pickBool = (k: BoolKeys): boolean => {
    const v = (runIn as Record<BoolKeys, unknown>)[k];
    return typeof v === 'boolean' ? v : RUN_BASE_DEFAULTS[k];
  };
  const pickNum = (
    name: 'hangWarn' | 'hangKill' | 'hangKillGrace',
    base: number,
  ): number => {
    if (typeof runIn[name] === 'number' && runIn[name] > 0) return runIn[name];
    return base;
  };
  const prompt =
    typeof runIn.prompt === 'string' && runIn.prompt.trim().length
      ? runIn.prompt.trim()
      : 'auto';
  // Plan header default: true unless explicitly overridden in cliDefaults.run.plan
  const plan = typeof runIn.plan === 'boolean' ? runIn.plan : true;
  // Overlay default: off unless cliDefaults.run.facets is true
  const facets = typeof runIn.facets === 'boolean' ? runIn.facets : false;
  const context = pickBool('context');

  return {
    archive: pickBool('archive'),
    combine: pickBool('combine'),
    plan,
    keep: pickBool('keep'),
    sequential: pickBool('sequential'),
    live: pickBool('live'),
    hangWarn: pickNum('hangWarn', RUN_BASE_DEFAULTS.hangWarn),
    hangKill: pickNum('hangKill', RUN_BASE_DEFAULTS.hangKill),
    hangKillGrace: pickNum('hangKillGrace', RUN_BASE_DEFAULTS.hangKillGrace),
    prompt,
    facets,
    context,
  };
};

/** Snap-phase defaults (only keys used by CLI: stash). */
export const snapDefaults = (
  dir = cwdSafe(),
): { stash?: boolean } | undefined => {
  try {
    const cfg = loadCliConfigSync(dir).cliDefaults;
    if (cfg && typeof cfg.snap === 'object') {
      const s = (cfg.snap as { stash?: unknown }).stash;
      if (typeof s === 'boolean') return { stash: s };
    }
  } catch {
    /* ignore */
  }
  return undefined;
};

/** Default patch file path from config (cliDefaults.patch.file), if set. */
export const patchDefaultFile = (dir = cwdSafe()): string | undefined => {
  const coerce = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;

  // Primary: strict loader (namespaced)
  try {
    const fromLoader = loadCliConfigSync(dir).cliDefaults?.patch?.file;
    const v = coerce(fromLoader);
    if (v) return v;
  } catch {
    /* fall through to raw parse */
  }

  // Fallback: parse stan.config.* directly (namespaced first; legacy root)
  try {
    const root = readRawConfigSync(dir);
    const cli = pickCliNode(root);
    // Namespaced
    const ns = (
      (cli as { cliDefaults?: { patch?: { file?: unknown } } } | null)
        ?.cliDefaults?.patch ?? {}
    ).file;
    const vNs = coerce(ns);
    if (vNs) return vNs;
    // Legacy root
    const legacy = (
      root as {
        cliDefaults?: { patch?: { file?: unknown } };
      }
    ).cliDefaults?.patch?.file;
    return coerce(legacy);
  } catch {
    return undefined;
  }
};
