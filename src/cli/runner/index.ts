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
// SSR/test-robust wrapper: prefer the helper when callable; otherwise manually pick named/default.
const tryResolveNamedOrDefault = <F>(
  mod: unknown,
  pickNamed: (m: unknown) => F | undefined,
  pickDefault: (m: unknown) => F | undefined,
  label?: string,
): F => {
  try {
    if (typeof resolveNamedOrDefaultFunction === 'function') {
      return resolveNamedOrDefaultFunction<F>(
        mod,
        pickNamed,
        pickDefault,
        label,
      );
    }
  } catch {
    /* ignore helper failures */
  }
  try {
    const named = pickNamed(mod);
    if (typeof named === 'function') return named as F;
  } catch {
    /* ignore */
  }
  try {
    const viaDefault = pickDefault(mod);
    if (typeof viaDefault === 'function') return viaDefault as F;
  } catch {
    /* ignore */
  }
  const what = label && label.trim().length ? label.trim() : 'export';
  throw new Error(`${what} not found`);
};

const getRegisterRunAction = (): RegisterRunActionFn => {
  return tryResolveNamedOrDefault<RegisterRunActionFn>(
    runActionMod as unknown,
    (m) => (m as ActionModule).registerRunAction,
    (m) =>
      (m as { default?: Partial<ActionModule> }).default?.registerRunAction,
    'registerRunAction',
  );
};
type OptionsModule = typeof import('../run/options');
type RegisterRunOptionsFn = OptionsModule['registerRunOptions'];
const getRegisterRunOptions = (): RegisterRunOptionsFn => {
  return tryResolveNamedOrDefault<RegisterRunOptionsFn>(
    runOptionsMod as unknown,
    (m) => (m as OptionsModule).registerRunOptions,
    (m) =>
      (m as { default?: Partial<OptionsModule> }).default?.registerRunOptions,
    'registerRunOptions',
  );
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
