/** src/cli/stan/init.ts
 * "stan init" subcommand (CLI adapter).
 * - Delegates to the init service under src/stan/init/service.ts
 * - Keeps the previous export performInit for backward-compat with tests.
 */
import type { Command } from 'commander';
import { Command as Commander } from 'commander';

import { performInitService } from '@/runner/init/service';

import { applyCliSafety } from './cli-utils';

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
  return performInitService(opts);
}

export function registerInit(cli: Commander): Command {
  // Idempotent safety on the root
  applyCliSafety(cli);

  const sub = cli
    .command('init')
    .description(
      'Create or update stan.config.json|yml by scanning package.json scripts.',
    );

  // Idempotent safety on the subcommand
  applyCliSafety(sub as unknown as Command);

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
      await performInitService({
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
