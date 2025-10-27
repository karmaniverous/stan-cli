/* src/cli/stan/runner/index.ts
 * Thin registration shell for "stan run".
 */
import type { Command } from 'commander';

// SSR/CJS-robust resolver for registerRunAction: prefer named, fall back to default.registerRunAction.
import * as runActionMod from '../run/action';
import * as runOptionsMod from '../run/options';

type ActionModule = typeof import('../run/action');
type RegisterRunActionFn = ActionModule['registerRunAction'];
const getRegisterRunAction = (): RegisterRunActionFn => {
  const mod = runActionMod as unknown as {
    registerRunAction?: unknown;
    default?: { registerRunAction?: unknown };
  };
  const named = mod?.registerRunAction;
  const viaDefault = mod?.default?.registerRunAction;
  const fn =
    typeof named === 'function'
      ? (named as RegisterRunActionFn)
      : typeof viaDefault === 'function'
        ? (viaDefault as RegisterRunActionFn)
        : undefined;
  if (!fn) throw new Error('registerRunAction not found');
  return fn;
};
type OptionsModule = typeof import('../run/options');
type RegisterRunOptionsFn = OptionsModule['registerRunOptions'];
const getRegisterRunOptions = (): RegisterRunOptionsFn => {
  const mod = runOptionsMod as unknown as {
    registerRunOptions?: unknown;
    default?: { registerRunOptions?: unknown };
  };
  const named = mod?.registerRunOptions;
  const viaDefault = mod?.default?.registerRunOptions;
  const fn =
    typeof named === 'function'
      ? (named as RegisterRunOptionsFn)
      : typeof viaDefault === 'function'
        ? (viaDefault as RegisterRunOptionsFn)
        : undefined;
  if (!fn) throw new Error('registerRunOptions not found');
  return fn;
};

/**
 * Register the `run` subcommand on the provided root CLI.
 *
 * @param cli - Commander root command.
 * @returns The same root command for chaining.
 */
export const registerRun = (cli: Command): Command => {
  // Resolve options/action at call time for SSR robustness
  const registerRunOptions = getRegisterRunOptions();
  const { cmd, getFlagPresence } = registerRunOptions(cli);
  const registerRunAction = getRegisterRunAction();
  registerRunAction(cmd, getFlagPresence);
  return cli;
};
