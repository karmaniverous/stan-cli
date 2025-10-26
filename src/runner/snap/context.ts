/* src/stan/snap/context.ts
 * Resolve execution context for snap commands (cwd, stanPath, maxUndos).
 */
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import * as coreMod from '@karmaniverous/stan-core';

import { loadCliConfig } from '@/cli/config/load';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import { DBG_SCOPE_SNAP_CONTEXT_LEGACY } from '@/runner/util/debug-scopes';

// SSR-robust resolver for core findConfigPathSync (named-or-default)
type CoreModule = typeof import('@karmaniverous/stan-core');
type FindConfigPathSyncFn = CoreModule['findConfigPathSync'];
const findConfigPathSyncResolved: FindConfigPathSyncFn =
  resolveNamedOrDefaultFunction<FindConfigPathSyncFn>(
    coreMod as unknown,
    (m) => (m as CoreModule).findConfigPathSync,
    (m) => (m as { default?: Partial<CoreModule> }).default?.findConfigPathSync,
    'findConfigPathSync',
  );

type ResolveStanPathSyncFn = CoreModule['resolveStanPathSync'];
const resolveStanPathSyncResolved: ResolveStanPathSyncFn =
  resolveNamedOrDefaultFunction<ResolveStanPathSyncFn>(
    coreMod as unknown,
    (m) => (m as CoreModule).resolveStanPathSync,
    (m) =>
      (m as { default?: Partial<CoreModule> }).default?.resolveStanPathSync,
    'resolveStanPathSync',
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
  const cfgPath = findConfigPathSyncResolved(cwd0);
  const cwd = cfgPath ? path.dirname(cfgPath) : cwd0;

  // Engine context (namespaced or legacy), resolved lazily to avoid SSR/ESM
  // evaluation-order hazards during module import. Prefer named export and
  // fall back to default.resolveEffectiveEngineConfig when present.
  let engine: ContextConfig;
  try {
    type EffModule = typeof import('@/runner/config/effective');
    type ResolveEngineCfgFn = EffModule['resolveEffectiveEngineConfig'];
    const eff = (await import('@/runner/config/effective')) as unknown;
    const named = (eff as EffModule).resolveEffectiveEngineConfig as
      | ResolveEngineCfgFn
      | undefined;
    const viaDefault =
      (
        eff as {
          default?: Partial<EffModule>;
        }
      ).default?.resolveEffectiveEngineConfig ?? undefined;
    const fn =
      typeof named === 'function'
        ? named
        : typeof viaDefault === 'function'
          ? viaDefault
          : undefined;
    if (!fn) throw new Error('resolveEffectiveEngineConfig not found');
    engine = await fn(cwd, DBG_SCOPE_SNAP_CONTEXT_LEGACY);
  } catch {
    // Minimal, safe fallback: derive stanPath only. This preserves snap
    // behavior even when the effective-config module cannot be resolved
    // (e.g., SSR/mock edge cases). Downstream consumers treat includes/
    // excludes as optional and default to [].
    let stanPath = '.stan';
    try {
      stanPath = resolveStanPathSyncResolved(cwd);
    } catch {
      /* keep default */
    }
    engine = { stanPath } as ContextConfig;
  }

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
