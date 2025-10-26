/* src/stan/snap/context.ts
 * Resolve execution context for snap commands (cwd, stanPath, maxUndos).
 */
import path from 'node:path';

import { findConfigPathSync } from '@karmaniverous/stan-core';

import { loadCliConfig } from '@/cli/config/load';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import * as effMod from '@/runner/config/effective';
import { DBG_SCOPE_SNAP_CONTEXT_LEGACY } from '@/runner/util/debug-scopes';

type EffModule = typeof import('@/runner/config/effective');
type ResolveEngineCfgFn = EffModule['resolveEffectiveEngineConfig'];
const resolveEffectiveEngineConfig: ResolveEngineCfgFn =
  resolveNamedOrDefaultFunction<ResolveEngineCfgFn>(
    effMod as unknown,
    (m) => (m as EffModule).resolveEffectiveEngineConfig,
    (m) =>
      (m as { default?: Partial<EffModule> }).default
        ?.resolveEffectiveEngineConfig,
    'resolveEffectiveEngineConfig',
  );

/**
 * Resolve the effective execution context for snapshot operations.
 * Starting from `cwd0`, locates the nearest `stan.config.*` and returns:
 * - `cwd`: the directory containing that config (or `cwd0` if none found),
 * - `stanPath`: configured workspace folder (defaults to ".stan"),
 * - `maxUndos`: normalized retention for snapshot history (default 10).
 *
 * @param cwd0 - Directory to start searching from.
 * @returns Resolved `{ cwd, stanPath, maxUndos }`.
 */
export const resolveContext = async (
  cwd0: string,
): Promise<{ cwd: string; stanPath: string; maxUndos: number }> => {
  const cfgPath = findConfigPathSync(cwd0);
  const cwd = cfgPath ? path.dirname(cfgPath) : cwd0;

  // Engine context (namespaced or legacy), snap-scoped debug label for legacy fallback
  const engine = await resolveEffectiveEngineConfig(
    cwd,
    DBG_SCOPE_SNAP_CONTEXT_LEGACY,
  );

  // CLI config for snap retention
  let maxUndos: number | undefined;
  try {
    const cli = await loadCliConfig(cwd);
    maxUndos = cli.maxUndos;
  } catch {
    /* ignore */
  }

  return { cwd, stanPath: engine.stanPath, maxUndos: maxUndos ?? 10 };
};
