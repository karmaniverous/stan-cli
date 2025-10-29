/** src/cli/stan/init.ts
 * "stan init" subcommand (CLI adapter).
 * - Delegates to the init service under src/stan/init/service.ts
 * - Keeps the previous export performInit for backward-compat with tests.
 */
import type { Command } from 'commander';
import { Command as Commander } from 'commander';

import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import * as initServiceMod from '@/runner/init/service';

import * as cliUtils from './cli-utils';
type CliUtilsModule = typeof import('./cli-utils');
type ApplyCliSafetyFn = CliUtilsModule['applyCliSafety'];
type InitModule = typeof import('@/runner/init/service');
type PerformInitServiceFn = InitModule['performInitService'];
const performInitServiceResolved: PerformInitServiceFn | undefined = (() => {
  try {
    return resolveNamedOrDefaultFunction<PerformInitServiceFn>(
      initServiceMod as unknown,
      (m) => (m as InitModule).performInitService,
      (m) =>
        (m as { default?: Partial<InitModule> }).default?.performInitService,
      'performInitService',
    );
  } catch {
    return undefined;
  }
})();

/**
 * Register the `init` subcommand on the provided root CLI.
 *
 * @param cli - Commander root command.
 * @returns The same root command for chaining.
 */
export async function performInit(
  _cli: Command,
  opts: {
    cwd?: string;
    force?: boolean;
    preserveScripts?: boolean;
    dryRun?: boolean;
  },
): Promise<string | null> {
  const fn = performInitServiceResolved;
  if (typeof fn === 'function') return fn(opts);
  // Fallback: attempt named access from the module (SSR edge), else null
  const fallback = (
    initServiceMod as unknown as {
      performInitService?: PerformInitServiceFn;
    }
  ).performInitService;
  return typeof fallback === 'function' ? fallback(opts) : null;
}

export function registerInit(cli: Commander): Command {
  // Hard guard: ensure parse normalization and exit override are present on the root
  // before any SSR-sensitive resolution. Idempotent and safe.
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
    /* best-effort */
  }

  // SSR‑robust resolver as before (kept for parity and idempotency)
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
  // Final safety: unconditionally ensure parse normalization and exit override (idempotent).
  try {
    (
      cliUtils as unknown as {
        installExitOverride?: (c: Command) => void;
        patchParseMethods?: (c: Command) => void;
      }
    ).patchParseMethods?.(cli);
    (
      cliUtils as unknown as {
        installExitOverride?: (c: Command) => void;
      }
    ).installExitOverride?.(cli);
  } catch {
    /* best-effort */
  }

  const sub = cli
    .command('init')
    .description(
      'Create or update stan.config.json|yml by scanning package.json scripts.',
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
        installExitOverride?: (c: Command) => void;
        patchParseMethods?: (c: Command) => void;
      }
    ).patchParseMethods?.(sub);
    (
      cliUtils as unknown as {
        installExitOverride?: (c: Command) => void;
      }
    ).installExitOverride?.(sub);
  } catch {
    /* best-effort */
  }

  sub
    .option(
      '-f, --force',
      'Create stan.config.yml with defaults (stanPath=stan).',
    )
    .option('-n, --dry-run', 'Do not write any changes (plan only).')
    .option(
      '--preserve-scripts',
      'Keep existing scripts from stan.config.* when present.',
    );

  sub.action(
    async (opts: {
      force?: boolean;
      preserveScripts?: boolean;
      dryRun?: boolean;
    }) => {
      // Resolve service lazily to avoid SSR/evaluation issues
      const fn = performInitServiceResolved;
      if (!fn) {
        // Silent best-effort in rare SSR anomalies; mirror prior behavior
        // by returning without side effects when the service cannot be resolved.
        return;
      }
      await fn({
        // performInitService signature accepts the same options bag
        force: Boolean(opts.force),
        preserveScripts: Boolean(opts.preserveScripts),
        dryRun: Boolean(opts.dryRun),
      });
    },
  );

  return cli;
}

// SSR/default-shaped consumers: provide a callable default that delegates
// to the named registerInit. This matches CLI index fallbacks and tests.
export default function registerInitDefault(cli: Commander): Command {
  return registerInit(cli);
}
