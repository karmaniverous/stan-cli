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
  let engine: ContextConfig | undefined;
  try {
    const effModUnknown = (await import(
      '@/runner/config/effective'
    )) as unknown;

    // Candidate caller (arity-aware: 0/1 args => cwd; 2+ => (cwd, scope)).
    const tryCall = async (fnMaybe: unknown): Promise<ContextConfig | null> => {
      if (typeof fnMaybe !== 'function') return null;
      try {
        const declared = (fnMaybe as { length?: number }).length ?? 2;
        const out =
          declared <= 1
            ? await (fnMaybe as (cwd: string) => Promise<ContextConfig>)(cwd)
            : await (
                fnMaybe as (
                  cwd: string,
                  scope?: string,
                ) => Promise<ContextConfig>
              )(cwd, DBG_SCOPE_SNAP_CONTEXT_LEGACY);
        if (
          out &&
          typeof out === 'object' &&
          typeof (out as { stanPath?: unknown }).stanPath === 'string'
        ) {
          return out;
        }
      } catch {
        /* move to next candidate */
      }
      return null;
    };

    // Build ordered candidates (short-circuit on first success).
    const mod = effModUnknown as {
      resolveEffectiveEngineConfig?: unknown;
      default?: { resolveEffectiveEngineConfig?: unknown };
    };
    const candidates: unknown[] = [];

    // 1) named export
    if (typeof mod.resolveEffectiveEngineConfig === 'function') {
      candidates.push(mod.resolveEffectiveEngineConfig);
    }
    // 2) default.resolveEffectiveEngineConfig
    const d = mod.default as
      | {
          resolveEffectiveEngineConfig?: unknown;
          default?: unknown;
        }
      | undefined;
    if (d && typeof d === 'object') {
      const p = (d as { resolveEffectiveEngineConfig?: unknown })
        .resolveEffectiveEngineConfig;
      if (typeof p === 'function') candidates.push(p);
    }
    // 3) function-as-default (common mock shape)
    if (typeof d === 'function') candidates.push(d);
    // 4) nested default.default function (rare)
    if (d && typeof (d as { default?: unknown }).default === 'function') {
      candidates.push((d as { default: unknown }).default);
    }
    // 5) module-as-function (edge mocks)
    if (typeof (mod as unknown) === 'function') {
      candidates.push(mod as unknown as () => Promise<ContextConfig>);
    }

    // Try in order
    for (const c of candidates) {
      const out = await tryCall(c);
      if (out) {
        engine = out;
        break;
      }
    }

    // As a last-resort, walk nested defaults a couple of levels to catch exotic shapes.
    if (!engine) {
      const seen = new Set<unknown>();
      const walk = (obj: unknown, depth = 0): void => {
        if (!obj || seen.has(obj) || depth > 3) return;
        seen.add(obj);
        if (typeof obj === 'function') candidates.push(obj);
        if (typeof obj !== 'object' && typeof obj !== 'function') return;
        const o = obj as { [k: string]: unknown };
        if (typeof o.resolveEffectiveEngineConfig === 'function')
          candidates.push(o.resolveEffectiveEngineConfig);
        if ('default' in o) walk(o.default, depth + 1);
      };
      walk(mod);
      for (const c of candidates) {
        const out = await tryCall(c);
        if (out) {
          engine = out;
          break;
        }
      }
      if (!engine) throw new Error('resolveEffectiveEngineConfig not found');
    }
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

  return {
    cwd,
    stanPath: engine.stanPath,
    maxUndos: maxUndos ?? 10,
  };
};
