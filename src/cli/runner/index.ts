/* src/cli/stan/runner/index.ts
 * Thin registration shell for "stan run".
 */
import type { Command } from 'commander';

import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';

// SSR/CJS-robust resolver for registerRunAction: prefer named, fall back to default.registerRunAction.
import * as runActionMod from '../run/action';
import * as runOptionsMod from '../run/options';

type ActionModule = typeof import('../run/action');
type RegisterRunActionFn = ActionModule['registerRunAction'];
const getRegisterRunAction = (): RegisterRunActionFn => {
  try {
    return resolveNamedOrDefaultFunction<RegisterRunActionFn>(
      runActionMod as unknown,
      (m) => (m as ActionModule).registerRunAction,
      (m) =>
        (m as { default?: Partial<ActionModule> }).default?.registerRunAction,
      'registerRunAction',
    );
  } catch {
    throw new Error('registerRunAction not found');
  }
};
type OptionsModule = typeof import('../run/options');
type RegisterRunOptionsFn = OptionsModule['registerRunOptions'];
const getRegisterRunOptions = (): RegisterRunOptionsFn => {
  try {
    return resolveNamedOrDefaultFunction<RegisterRunOptionsFn>(
      runOptionsMod as unknown,
      (m) => (m as OptionsModule).registerRunOptions,
      (m) =>
        (m as { default?: Partial<OptionsModule> }).default?.registerRunOptions,
      'registerRunOptions',
    );
  } catch {
    throw new Error('registerRunOptions not found');
  }
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
