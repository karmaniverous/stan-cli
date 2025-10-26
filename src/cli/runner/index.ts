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
const registerRunActionResolved: RegisterRunActionFn =
  resolveNamedOrDefaultFunction<RegisterRunActionFn>(
    runActionMod as unknown,
    (m) => (m as ActionModule).registerRunAction,
    (m) =>
      (m as { default?: Partial<ActionModule> }).default?.registerRunAction,
    'registerRunAction',
  );
type OptionsModule = typeof import('../run/options');
type RegisterRunOptionsFn = OptionsModule['registerRunOptions'];
const registerRunOptionsResolved: RegisterRunOptionsFn =
  resolveNamedOrDefaultFunction<RegisterRunOptionsFn>(
    runOptionsMod as unknown,
    (m) => (m as OptionsModule).registerRunOptions,
    (m) =>
      (m as { default?: Partial<OptionsModule> }).default?.registerRunOptions,
    'registerRunOptions',
  );

/**
 * Register the `run` subcommand on the provided root CLI.
 *
 * @param cli - Commander root command.
 * @returns The same root command for chaining.
 */
export const registerRun = (cli: Command): Command => {
  const { cmd, getFlagPresence } = registerRunOptionsResolved(cli);
  registerRunActionResolved(cmd, getFlagPresence);
  return cli;
};
