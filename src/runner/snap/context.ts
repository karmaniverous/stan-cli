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
  // evaluation-order hazards during module import.
  let engine: ContextConfig;
  try {
    const effMod = (await import('@/runner/config/effective')) as unknown;

    const tryCall = async (fnMaybe: unknown): Promise<ContextConfig | null> => {
      if (typeof fnMaybe !== 'function') return null;
      try {
        const out = await (
          fnMaybe as (cwd: string, scope?: string) => Promise<ContextConfig>
        )(cwd, DBG_SCOPE_SNAP_CONTEXT_LEGACY);
        if (
          out &&
          typeof out === 'object' &&
          typeof (out as { stanPath?: unknown }).stanPath === 'string'
        ) {
          return out;
        }
      } catch {
        // continue to next candidate
      }
      return null;
    };

    // Recursively enumerate plausible function candidates from the module and its nested defaults.
    const candidates: unknown[] = [];
    const seen = new Set<unknown>();
    const walk = (obj: unknown, depth = 0): void => {
      if (!obj || seen.has(obj) || depth > 4) return;
      seen.add(obj);

      // Direct function candidate
      if (typeof obj === 'function') {
        candidates.push(obj);
      }

      if (typeof obj !== 'object' && typeof obj !== 'function') return;
      const o = obj as { [k: string]: unknown };

      // Named resolver export
      if (typeof o.resolveEffectiveEngineConfig === 'function') {
        candidates.push(o.resolveEffectiveEngineConfig);
      }

      // Explore nested default(s)
      if ('default' in o) {
        const d = o.default;
        if (d) {
          if (
            typeof (d as { resolveEffectiveEngineConfig?: unknown })
              .resolveEffectiveEngineConfig === 'function'
          ) {
            candidates.push(
              (
                d as {
                  resolveEffectiveEngineConfig: unknown;
                }
              ).resolveEffectiveEngineConfig,
            );
          }
          // Walk default
          walk(d, depth + 1);
          // Some shapes use default.default chains
          if (
            typeof d === 'object' &&
            d &&
            'default' in (d as { [k: string]: unknown })
          ) {
            walk((d as { default?: unknown }).default, depth + 1);
          }
        }
      }
    };

    walk(effMod);

    let pickedCfg: ContextConfig | null = null;
    for (const c of candidates) {
      pickedCfg = await tryCall(c);
      if (pickedCfg) break;
    }
    if (!pickedCfg) throw new Error('resolveEffectiveEngineConfig not found');
    engine = pickedCfg;
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
