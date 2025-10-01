/* src/cli/stan/runner.ts
 * Thin registration shell for "stan run".
 */
import type { Command } from 'commander';

import { registerRunAction } from './run/action';
import { registerRunOptions } from './run/options';

/**
 * Register the `run` subcommand on the provided root CLI.
 *
 * @param cli - Commander root command.
 * @returns The same root command for chaining.
 */
export const registerRun = (cli: Command): Command => {
  const { cmd, getFlagPresence } = registerRunOptions(cli);
  registerRunAction(cmd, getFlagPresence);
  return cli;
};
