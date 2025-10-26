/** Shared Commander helpers for STAN CLI.
 * DRY the repeated exitOverride + parse normalization across subcommands.
 */

import type { ContextConfig } from '@karmaniverous/stan-core';
import { findConfigPathSync, loadConfigSync } from '@karmaniverous/stan-core';
import type { Command, Option } from 'commander';

import { loadCliConfigSync } from '@/cli/config/load';

import { RUN_BASE_DEFAULTS } from './run/defaults';

const cwdSafe = (): string => {
  try {
    return process.cwd();
  } catch {
    return '.';
  }
};
const isStringArray = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.every((t) => typeof t === 'string');
/** Normalize argv from unit tests like ["node","stan", ...] -\> [...] */
export const normalizeArgv = (
  argv?: readonly string[],
): readonly string[] | undefined => {
  if (!isStringArray(argv)) return undefined;
  if (argv.length >= 2 && argv[0] === 'node' && argv[1] === 'stan') {
    return argv.slice(2);
  }
  return argv;
};

/** Patch parse() and parseAsync() to normalize argv before Commander parses. */
export const patchParseMethods = (cli: Command): void => {
  type FromOpt = { from?: 'user' | 'node' };
  type ParseFn = (argv?: readonly string[], opts?: FromOpt) => Command;
  type ParseAsyncFn = (
    argv?: readonly string[],
    opts?: FromOpt,
  ) => Promise<Command>;

  const holder = cli as unknown as {
    parse: ParseFn;
    parseAsync: ParseAsyncFn;
  };

  const origParse = holder.parse.bind(cli);
  const origParseAsync = holder.parseAsync.bind(cli);

  holder.parse = (argv?: readonly string[], opts?: FromOpt) => {
    origParse(normalizeArgv(argv), opts);
    return cli;
  };

  holder.parseAsync = async (argv?: readonly string[], opts?: FromOpt) => {
    await origParseAsync(normalizeArgv(argv), opts);
    return cli;
  };
};

/** Install a Commander exit override that swallows benign exits during tests. */
export const installExitOverride = (cmd: Command): void => {
  cmd.exitOverride((err) => {
    // Swallow benign/expected exits to avoid noisy stack traces in CLI usage.
    const swallow = new Set<string>([
      'commander.helpDisplayed',
      'commander.unknownCommand',
      'commander.unknownOption',
      'commander.help',
      // New: treat excess arguments as a friendly help case.
      'commander.excessArguments',
    ]);
    if (swallow.has(err.code)) {
      if (err.code === 'commander.excessArguments') {
        try {
          // Print concise message then help footer.
          // Commander typically prints the message already; ensure help is shown.
          // Avoid rethrowing to prevent stack traces.
          if (err.message) console.error(err.message);
          cmd.outputHelp();
        } catch {
          // best‑effort
        }
      }
      return;
    }
    throw err;
  });
};
/** Apply both safety adapters to a command. */
export function applyCliSafety(cmd: Command): void {
  try {
    installExitOverride(cmd);
    patchParseMethods(cmd);
  } catch {
    /* best-effort */
  }
}

/** Tag an Option description with (DEFAULT) when active. */
export const tagDefault = (opt: Option, on: boolean): void => {
  if (on && !opt.description.includes('(default)')) {
    opt.description = `${opt.description} (default)`;
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
export const rootDefaults = (
  dir = cwdSafe(),
): { debugDefault: boolean; boringDefault: boolean; yesDefault: boolean } => {
  // Read from stan-cli only; fall back to built-ins when absent.
  let debugDefault = false;
  let boringDefault = false;
  let yesDefault = false;
  try {
    const cli = loadCliConfigSync(dir).cliDefaults;
    debugDefault = Boolean(cli?.debug ?? false);
    boringDefault = Boolean(cli?.boring ?? false);
    // "yes" is not part of the canonical schema; keep a permissive read for transition.
    yesDefault = Boolean((cli as { yes?: boolean } | undefined)?.yes ?? false);
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
  } = {};
  try {
    runIn = (loadCliConfigSync(dir).cliDefaults?.run ?? {}) as typeof runIn;
  } catch {
    // keep empty; use baselines
  }
  type BoolKeys = 'archive' | 'combine' | 'keep' | 'sequential' | 'live';
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
  const facets =
    typeof runIn.facets === 'boolean' ? Boolean(runIn.facets) : false;

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
  };
};

/** Default patch file path from config (cliDefaults.patch.file), if set. */
export const patchDefaultFile = (dir = cwdSafe()): string | undefined => {
  let p: unknown;
  try {
    p = loadCliConfigSync(dir).cliDefaults?.patch?.file;
  } catch {
    p = undefined;
  }
  return typeof p === 'string' && p.trim().length ? p.trim() : undefined;
};
