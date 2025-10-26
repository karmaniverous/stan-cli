/* src/stan/snap/context.ts
 * Resolve execution context for snap commands (cwd, stanPath, maxUndos).
 */
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';

import { loadCliConfig } from '@/cli/config/load';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import { DBG_SCOPE_SNAP_CONTEXT_LEGACY } from '@/runner/util/debug-scopes';

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
  // Lazily resolve core helpers to avoid SSR/ESM import-time races.
  type CoreModule = typeof import('@karmaniverous/stan-core');
  type FindConfigPathSyncFn = CoreModule['findConfigPathSync'];
  type ResolveStanPathSyncFn = CoreModule['resolveStanPathSync'];
  let cwd = cwd0;
  let resolveStanPathSyncResolved: ResolveStanPathSyncFn | null = null;
  try {
    const coreMod = (await import('@karmaniverous/stan-core')) as unknown;
    const findConfigPathSyncResolved =
      resolveNamedOrDefaultFunction<FindConfigPathSyncFn>(
        coreMod,
        (m) => (m as CoreModule).findConfigPathSync,
        (m) =>
          (m as { default?: Partial<CoreModule> }).default?.findConfigPathSync,
        'findConfigPathSync',
      );
    const cfgPath = findConfigPathSyncResolved(cwd0);
    cwd = cfgPath ? path.dirname(cfgPath) : cwd0;
    // Keep a resolved handle for fallback stanPath derivation
    resolveStanPathSyncResolved =
      resolveNamedOrDefaultFunction<ResolveStanPathSyncFn>(
        coreMod,
        (m) => (m as CoreModule).resolveStanPathSync,
        (m) =>
          (m as { default?: Partial<CoreModule> }).default?.resolveStanPathSync,
        'resolveStanPathSync',
      );
  } catch {
    // best‑effort; keep cwd=cwd0 and derive stanPath in the general fallback below
    resolveStanPathSyncResolved = null;
  }

  // Engine context (namespaced or legacy), resolved lazily to avoid SSR/ESM
  // evaluation-order hazards during module import. Prefer named export and
  // fall back to default.resolveEffectiveEngineConfig when present.
  let engine: ContextConfig;
  try {
    type EffModule = typeof import('@/runner/config/effective');
    type ResolveEngineCfgFn = EffModule['resolveEffectiveEngineConfig'];
    const eff = (await import('@/runner/config/effective')) as unknown;
    // Robust pick across common ESM/CJS/mock shapes:
    // - named: module.resolveEffectiveEngineConfig
    // - default object: module.default.resolveEffectiveEngineConfig
    // - nested default: module.default.default.resolveEffectiveEngineConfig
    // - function-as-default: module.default is the function
    const pickEff = (mod: unknown): ResolveEngineCfgFn | undefined => {
      try {
        const m = mod as {
          resolveEffectiveEngineConfig?: unknown;
          default?:
            | ResolveEngineCfgFn
            | {
                resolveEffectiveEngineConfig?: unknown;
                default?: { resolveEffectiveEngineConfig?: unknown };
              };
        };
        const candidates: unknown[] = [
          m?.resolveEffectiveEngineConfig,
          m?.default,
          (m?.default as { resolveEffectiveEngineConfig?: unknown })
            ?.resolveEffectiveEngineConfig,
          (
            m?.default as {
              default?: { resolveEffectiveEngineConfig?: unknown };
            }
          )?.default,
          (
            m?.default as {
              default?: { resolveEffectiveEngineConfig?: unknown };
            }
          )?.default?.resolveEffectiveEngineConfig,
        ];
        for (const c of candidates) {
          if (typeof c === 'function') return c as ResolveEngineCfgFn;
        }
      } catch {
        /* ignore and fall through */
      }
      return undefined;
    };
    const fn = pickEff(eff);
    if (!fn) throw new Error('resolveEffectiveEngineConfig not found');
    engine = await fn(cwd, DBG_SCOPE_SNAP_CONTEXT_LEGACY);
  } catch {
    // Minimal, safe fallback: derive stanPath only. This preserves snap
    // behavior even when the effective-config module cannot be resolved
    // (e.g., SSR/mock edge cases). Downstream consumers treat includes/
    // excludes as optional and default to [].
    let stanPath = '.stan';
    try {
      stanPath = resolveStanPathSyncResolved
        ? resolveStanPathSyncResolved(cwd)
        : stanPath;
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
