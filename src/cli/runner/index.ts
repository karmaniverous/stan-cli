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
  } catch (e) {
    // Extra SSR fallbacks:
    // 1) default as function
    try {
      const defAny = (runActionMod as unknown as { default?: unknown }).default;
      if (typeof defAny === 'function') return defAny as RegisterRunActionFn;
      // 2) nested default.default
      const nested =
        defAny && typeof defAny === 'object'
          ? (defAny as { default?: unknown }).default
          : undefined;
      if (typeof nested === 'function') return nested as RegisterRunActionFn;
      // 3) module-as-function
      if (typeof runActionMod === 'function')
        return runActionMod as RegisterRunActionFn;
      // 4) scan default object for any callable
      if (defAny && typeof defAny === 'object') {
        for (const v of Object.values(defAny as Record<string, unknown>)) {
          if (typeof v === 'function') return v as RegisterRunActionFn;
        }
      }
      // 5) scan top-level module object for any callable (rare SSR mock shape)
      for (const v of Object.values(
        runActionMod as unknown as Record<string, unknown>,
      )) {
        if (typeof v === 'function') return v as RegisterRunActionFn;
      }
    } catch {
      /* ignore and rethrow original */
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
};
type OptionsModule = typeof import('../run/options');
type RegisterRunOptionsFn = OptionsModule['registerRunOptions'];
const getRegisterRunOptions = (): RegisterRunOptionsFn => {
  return resolveNamedOrDefaultFunction<RegisterRunOptionsFn>(
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
