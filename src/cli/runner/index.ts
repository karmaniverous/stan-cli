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
  const registerRunAction = getRegisterRunAction();
  registerRunAction(cmd, getFlagPresence);
  return cli;
};
