/* src/cli/stan/runner/index.ts
 * Thin registration shell for "stan run".
 */
import type { Command } from 'commander';

// SSR/CJS-robust resolver for registerRunAction: prefer named, fall back to default.registerRunAction.
import * as runActionMod from '../run/action';
import { registerRunOptions } from '../run/options';

type FlagPresence = {
  sawNoScriptsFlag: boolean;
  sawScriptsFlag: boolean;
  sawExceptFlag: boolean;
};

const resolveRegisterRunAction = ():
  | ((cmd: Command, getFlagPresence: () => FlagPresence) => void)
  | undefined => {
  const mod = runActionMod as unknown as {
    registerRunAction?: unknown;
    default?: { registerRunAction?: unknown };
  };
  const fn =
    typeof mod.registerRunAction === 'function'
      ? mod.registerRunAction
      : typeof mod.default?.registerRunAction === 'function'
        ? mod.default.registerRunAction
        : undefined;
  return fn as
    | ((cmd: Command, getFlagPresence: () => FlagPresence) => void)
    | undefined;
};

/**
 * Register the `run` subcommand on the provided root CLI.
 *
 * @param cli - Commander root command.
 * @returns The same root command for chaining.
 */
export const registerRun = (cli: Command): Command => {
  const { cmd, getFlagPresence } = registerRunOptions(cli);
  resolveRegisterRunAction()?.(cmd, getFlagPresence);
  return cli;
};
