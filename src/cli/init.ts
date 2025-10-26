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
export const performInit = (
  _cli: Command,
  opts: {
    cwd?: string;
    force?: boolean;
    preserveScripts?: boolean;
    dryRun?: boolean;
  },
): Promise<string | null> => {
  const fn = performInitServiceResolved;
  if (typeof fn === 'function') return fn(opts);
  // Fallback: attempt named access from the module (SSR edge), else null
  const fallback = (
    initServiceMod as unknown as {
      performInitService?: PerformInitServiceFn;
    }
  ).performInitService;
  return typeof fallback === 'function'
    ? fallback(opts)
    : Promise.resolve(null);
};

export const registerInit = (cli: Commander): Command => {
  try {
    const applyCliSafetyResolved: ApplyCliSafetyFn | undefined =
      resolveNamedOrDefaultFunction<ApplyCliSafetyFn>(
        cliUtils as unknown,
        (m) => (m as CliUtilsModule).applyCliSafety,
        (m) =>
          (m as { default?: Partial<CliUtilsModule> }).default?.applyCliSafety,
        'applyCliSafety',
      );
    applyCliSafetyResolved?.(cli);
  } catch {
    /* best-effort */
  }

  const sub = cli
    .command('init')
    .description(
      'Create or update stan.config.json|yml by scanning package.json scripts.',
    );

  try {
    const applyCliSafetySub: ApplyCliSafetyFn | undefined =
      resolveNamedOrDefaultFunction<ApplyCliSafetyFn>(
        cliUtils as unknown,
        (m) => (m as CliUtilsModule).applyCliSafety,
        (m) =>
          (m as { default?: Partial<CliUtilsModule> }).default?.applyCliSafety,
        'applyCliSafety',
      );
    applyCliSafetySub?.(sub);
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
};
