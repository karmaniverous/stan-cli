/* REQUIREMENTS (current):
 * - Export makeCli(): Command — root CLI factory for the "stan" tool.
 * - Register subcommands: run, init, snap.
 * - Vector to interactive init when no config exists (root invocation with no args).
 * - Vector to interactive init when no config exists (root invocation with no args).
 * - Avoid invoking process.exit during tests; call cli.exitOverride().
 * - Help for root should include available script keys from config.
 */

import { readFileSync } from 'node:fs';

import { findConfigPathSync } from '@karmaniverous/stan-core';
import { Command, Option } from 'commander';

import { parseText } from '@/common/config/parse';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import { renderAvailableScriptsHelp } from '@/runner/help';
import { printVersionInfo } from '@/runner/version';

import * as cliUtils from './cli-utils';
import { performInit, registerInit as registerInitNamed } from './init';
// SSR‑robust resolver for registerInit (named or default) to prevent timing issues in tests
import * as initMod from './init';
type InitModule = typeof import('./init');
type RegisterInitFn = InitModule['registerInit'];
let registerInitResolved: RegisterInitFn | undefined;
try {
  registerInitResolved = resolveNamedOrDefaultFunction<RegisterInitFn>(
    initMod as unknown,
    (m) => (m as InitModule).registerInit,
    (m) => (m as { default?: Partial<InitModule> }).default?.registerInit,
    'registerInit',
  );
} catch (e) {
  // Extra SSR/mocks fallback: accept default export when it is a callable function
  try {
    const def = (initMod as unknown as { default?: unknown }).default;
    if (typeof def === 'function') {
      registerInitResolved = def as unknown as RegisterInitFn;
    } else {
      // Swallow resolution error; fall back later (named import or no-op).
      registerInitResolved = undefined;
    }
  } catch {
    registerInitResolved = undefined;
  }
}
// Robustly resolve registerPatch (named or default export) to tolerate SSR/ESM interop.
import * as patchMod from './patch';
import { registerRun } from './runner';
import { registerSnap } from './snap';
type PatchModule = typeof import('./patch');
type RegisterPatchFn = PatchModule['registerPatch'];
let registerPatchResolved: RegisterPatchFn | undefined;
try {
  registerPatchResolved = resolveNamedOrDefaultFunction<RegisterPatchFn>(
    patchMod as unknown,
    (m) => (m as PatchModule).registerPatch,
    (m) => (m as { default?: Partial<PatchModule> }).default?.registerPatch,
    'registerPatch',
  );
} catch {
  // Extra SSR/mocks fallbacks; swallow on failure (subcommand is optional for tests that don't need it).
  try {
    const def = (patchMod as unknown as { default?: unknown }).default;
    if (typeof def === 'function') {
      registerPatchResolved = def as unknown as RegisterPatchFn;
    } else {
      // leave undefined; runtime call is guarded
      registerPatchResolved = undefined;
    }
  } catch {
    registerPatchResolved = undefined;
  }
}

type CliUtilsModule = typeof import('./cli-utils');
type ApplyCliSafetyFn = CliUtilsModule['applyCliSafety'];
type RootDefaultsFn = CliUtilsModule['rootDefaults'];
const applyCliSafetyResolved: ApplyCliSafetyFn | undefined = (() => {
  try {
    return resolveNamedOrDefaultFunction<ApplyCliSafetyFn>(
      cliUtils as unknown,
      (m) => (m as CliUtilsModule).applyCliSafety,
      (m) =>
        (m as { default?: Partial<CliUtilsModule> }).default?.applyCliSafety,
      'applyCliSafety',
    );
  } catch {
    return undefined;
  }
})();
const rootDefaultsResolved: RootDefaultsFn | undefined = (() => {
  try {
    return resolveNamedOrDefaultFunction<RootDefaultsFn>(
      cliUtils as unknown,
      (m) => (m as CliUtilsModule).rootDefaults,
      (m) => (m as { default?: Partial<CliUtilsModule> }).default?.rootDefaults,
      'rootDefaults',
    );
  } catch {
    return undefined;
  }
})();
type TagDefaultFn = CliUtilsModule['tagDefault'];
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
/**
 * Build the root CLI (`stan`) without side effects (safe for tests). *
 * Registers the `run`, `init`, `snap`, and `patch` subcommands, installs
 * global `--debug` and `--boring` options, and renders the help footer
 * with available script keys.
 *
 * @returns New Commander `Command` instance.
 */
export const makeCli = (): Command => {
  // Synchronous fallback for root env defaults (SSR-friendly):
  // When the named resolver is unavailable, parse stan.config.* directly
  // and coerce cliDefaults.{debug,boring,yes}.
  const readRootDefaultsFromConfig = (
    dir: string,
  ): {
    debugDefault: boolean;
    boringDefault: boolean;
    yesDefault: boolean;
  } | null => {
    try {
      const p = findConfigPathSync(dir);
      if (!p) return null;
      const raw = readFileSync(p, 'utf8');
      const rootUnknown: unknown = parseText(p, raw);
      const root =
        rootUnknown && typeof rootUnknown === 'object'
          ? (rootUnknown as Record<string, unknown>)
          : {};
      const cliNs =
        root['stan-cli'] && typeof root['stan-cli'] === 'object'
          ? (root['stan-cli'] as Record<string, unknown>)
          : null;
      // Coercer for 1/0, true/false, string variants
      const toBool = (v: unknown): boolean => {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v === 1;
        if (typeof v === 'string') {
          const s = v.trim().toLowerCase();
          return s === '1' || s === 'true';
        }
        return false;
      };
      const pick = (node: Record<string, unknown> | null | undefined) => {
        const d = node && typeof node === 'object' ? node : {};
        const def =
          d['cliDefaults'] && typeof d['cliDefaults'] === 'object'
            ? (d['cliDefaults'] as Record<string, unknown>)
            : {};
        const debugDefault = toBool((def as { debug?: unknown }).debug);
        const boringDefault = toBool((def as { boring?: unknown }).boring);
        // "yes" is permissive: not part of canonical schema, but keep transitional read.
        const yesDefault = toBool((def as { yes?: unknown }).yes);
        return { debugDefault, boringDefault, yesDefault };
      };
      if (cliNs) return pick(cliNs);
      // Legacy root fallback
      return pick(root);
    } catch {
      return null;
    }
  };
  const cli = new Command();
  // Resolve effective defaults from config (when present); fall back to built‑ins.
  const safeRootDefaults = (): {
    debugDefault: boolean;
    boringDefault: boolean;
    yesDefault: boolean;
  } => {
    try {
      if (rootDefaultsResolved) {
        return rootDefaultsResolved(process.cwd());
      }
      // SSR fallback: read directly from stan.config.* synchronously
      const viaConfig = readRootDefaultsFromConfig(process.cwd());
      if (viaConfig) return viaConfig;
      return { debugDefault: false, boringDefault: false, yesDefault: false };
    } catch {
      const viaConfig = readRootDefaultsFromConfig(process.cwd());
      if (viaConfig) return viaConfig;
      return { debugDefault: false, boringDefault: false, yesDefault: false };
    }
  };
  const { debugDefault, boringDefault } = safeRootDefaults();

  cli.name('stan').description(
    // A clearer story than the prior one‑liner.
    'Snapshot your repo and deterministic outputs, attach archives in chat, and safely round‑trip unified‑diff patches.',
  );

  const optDebug = new Option('-d, --debug', 'enable verbose debug logging');
  const optNoDebug = new Option(
    '-D, --no-debug',
    'disable verbose debug logging',
  );
  tagDefaultResolved?.(debugDefault ? optDebug : optNoDebug, true);
  cli.addOption(optDebug).addOption(optNoDebug);

  const optBoring = new Option(
    '-b, --boring',
    'disable all color and styling (useful for tests/CI)',
  );
  const optNoBoring = new Option(
    '-B, --no-boring',
    'do not disable color/styling',
  );
  tagDefaultResolved?.(boringDefault ? optBoring : optNoBoring, true);
  cli.addOption(optBoring).addOption(optNoBoring);

  cli.option('-v, --version', 'print version and baseline-docs status');

  // Root-level help footer: show available script keys
  cli.addHelpText('after', () => renderAvailableScriptsHelp(process.cwd())); // Ensure tests never call process.exit() and argv normalization is consistent
  try {
    // Best-effort SSR-safe application of exit override/argv normalization
    applyCliSafetyResolved?.(cli);
  } catch {
    /* best‑effort */
  }
  // Final safety: ensure parse normalization and exit override even if resolution failed (idempotent).
  try {
    (
      cliUtils as unknown as {
        patchParseMethods?: (c: Command) => void;
        installExitOverride?: (c: Command) => void;
      }
    ).patchParseMethods?.(cli);
    (
      cliUtils as unknown as {
        installExitOverride?: (c: Command) => void;
      }
    ).installExitOverride?.(cli);
  } catch {
    /* best‑effort */
  }

  // Propagate -d/--debug to subcommands (set before any subcommand action)
  cli.hook('preAction', (thisCommand) => {
    try {
      const envDebugActive = process.env.STAN_DEBUG === '1';
      const root = thisCommand.parent ?? thisCommand;
      const holder = root as unknown as {
        opts?: () => { debug?: boolean; boring?: boolean };
        getOptionValueSource?: (name: string) => string | undefined;
      };
      const opts = holder.opts?.() ?? {};

      // Resolve config defaults (best‑effort; SSR‑safe)
      const { debugDefault, boringDefault } = safeRootDefaults();

      const src = holder.getOptionValueSource?.bind(root);
      const debugFromCli =
        src && src('debug') === 'cli' ? Boolean(opts.debug) : undefined;
      const boringFromCli =
        src && src('boring') === 'cli' ? Boolean(opts.boring) : undefined;

      // Preserve an explicit STAN_DEBUG=1 from the environment unless the user
      // negates it via CLI flags; otherwise fall back to config defaults.
      let debugFinal = debugDefault;
      if (typeof debugFromCli === 'boolean') {
        debugFinal = debugFromCli;
      } else if (envDebugActive) {
        debugFinal = true;
      }

      const boringFinal =
        typeof boringFromCli === 'boolean' ? boringFromCli : boringDefault;
      if (debugFinal) process.env.STAN_DEBUG = '1';
      else {
        // Ensure negated flag clears any prior setting from defaults
        delete process.env.STAN_DEBUG;
      }
      if (boringFinal) {
        process.env.STAN_BORING = '1';
        process.env.FORCE_COLOR = '0';
        process.env.NO_COLOR = '1';
      } else {
        // Ensure negated flag clears any prior setting from defaults
        delete process.env.STAN_BORING;
        delete process.env.FORCE_COLOR;
        delete process.env.NO_COLOR;
      }
    } catch {
      // ignore
    }
  });
  // Subcommands
  registerRun(cli);
  // Prefer resolved function; fall back to named import; otherwise skip (tests that don't need init).
  try {
    (registerInitResolved ?? registerInitNamed)?.(cli);
  } catch {
    /* best‑effort */
  }
  registerSnap(cli);
  try {
    registerPatchResolved?.(cli);
  } catch {
    /* best-effort */
  }

  // Root action:
  // - If -v/--version: print extended version info and return.
  // - If config is missing: run interactive init (not forced) and create a snapshot.
  // - If config exists: print help page (no exit).
  cli.action(async () => {
    const opts = cli.opts<{
      debug?: boolean;
      boring?: boolean;
      version?: boolean;
    }>();
    // preAction already resolved and set env from flags>config>built-ins.

    if (opts.version) {
      const vmod = await import('@/runner/version');
      const info = await vmod.getVersionInfo(process.cwd());
      printVersionInfo(info);
      return;
    }

    const cwd = process.cwd();
    const cfgMod = await import('@karmaniverous/stan-core');
    const hasConfig = !!cfgMod.findConfigPathSync(cwd);

    if (!hasConfig) {
      await performInit(cli, { cwd, force: false });
      return;
    }

    // Print help information without invoking .help() (which throws on exit).
    console.log(cli.helpInformation());
  });

  return cli;
};
