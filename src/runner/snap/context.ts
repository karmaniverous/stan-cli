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
export async function resolveContext(
  cwd0: string,
): Promise<{ cwd: string; stanPath: string; maxUndos: number }> {
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

    // Decide if we should print a single success trace when STAN_DEBUG=1.
    const debugOn = (): boolean => process.env.STAN_DEBUG === '1';
    const debugTrace = (kind: string): void => {
      if (!debugOn()) return;
      try {
        // concise, single-line marker for CI logs
        console.error(`stan: debug: snap.context: candidate=${kind}`);
      } catch {
        /* ignore */
      }
    };

    // Candidate caller: try multiple signatures and short-circuit on first valid config.
    const tryCall = async (
      fnMaybe: unknown,
      kind: string,
    ): Promise<ContextConfig | null> => {
      if (typeof fnMaybe !== 'function') return null;
      const invoke = async (
        ...args: unknown[]
      ): Promise<ContextConfig | null> => {
        try {
          const out = await (fnMaybe as (...a: unknown[]) => unknown)(...args);
          if (
            out &&
            typeof out === 'object' &&
            typeof (out as { stanPath?: unknown }).stanPath === 'string'
          ) {
            return out as ContextConfig;
          }
        } catch {
          /* try next signature */
        }
        return null;
      };
      // Prefer 2+ arity with scope when declared suggests it.
      const declared = (fnMaybe as { length?: number }).length;
      if (typeof declared === 'number' && declared >= 2) {
        const a2 = await invoke(cwd, DBG_SCOPE_SNAP_CONTEXT_LEGACY);
        if (a2) {
          debugTrace(kind);
          return a2;
        }
      }
      // Always try (cwd)
      const a1 = await invoke(cwd);
      if (a1) {
        debugTrace(kind);
        return a1;
      }
      // Finally, no-arg call
      const a0 = await invoke();
      if (a0) {
        debugTrace(kind);
        return a0;
      }
      return null;
    };

    // Build ordered candidates (short‑circuit on first success).
    const mod = effModUnknown as {
      resolveEffectiveEngineConfig?: unknown;
      default?: { resolveEffectiveEngineConfig?: unknown; default?: unknown };
    };

    // Immediate fast path: function-as-default — call directly before building the list
    try {
      const dAny = (mod as unknown as { default?: unknown }).default;
      if (typeof dAny === 'function') {
        const fast = await tryCall(dAny, 'default-fn');
        if (fast) {
          engine = fast;
        }
      }
    } catch {
      /* best-effort */
    }

    const candidates: Array<{ fn: unknown; kind: string }> = [];
    if (!engine) {
      // Prefer default‑only shapes first (matches common test/mock shapes):
      // 1) function‑as‑default (still include in list for completeness)
      const dAny = (mod as unknown as { default?: unknown }).default;
      if (typeof dAny === 'function')
        candidates.push({ fn: dAny, kind: 'default-fn' });
      // 2) default.resolveEffectiveEngineConfig
      const dObj =
        dAny && typeof dAny === 'object'
          ? (dAny as {
              resolveEffectiveEngineConfig?: unknown;
              default?: unknown;
            })
          : undefined;
      if (dObj && typeof dObj.resolveEffectiveEngineConfig === 'function') {
        candidates.push({
          fn: dObj.resolveEffectiveEngineConfig,
          kind: 'default.resolve',
        });
      }
      // 3) named export
      if (typeof mod.resolveEffectiveEngineConfig === 'function') {
        candidates.push({
          fn: mod.resolveEffectiveEngineConfig,
          kind: 'named',
        });
      }
      // 4) nested default.default function (rare)
      if (dObj && typeof dObj.default === 'function') {
        candidates.push({ fn: dObj.default, kind: 'default.default-fn' });
      }
      // 5) module‑as‑function (edge mocks)
      if (typeof (mod as unknown) === 'function') {
        candidates.push({
          fn: mod as unknown as () => Promise<ContextConfig>,
          kind: 'module-fn',
        });
      }

      // Also scan the immediate default object for any function-valued properties.
      // This catches odd default-only mock shapes without waiting for the deeper walk.
      if (dObj && typeof dObj === 'object') {
        try {
          for (const [, v] of Object.entries(dObj)) {
            if (typeof v === 'function') {
              // Avoid duplicate candidates (simple identity/label guard)
              if (!candidates.some((c) => c.fn === v)) {
                candidates.push({ fn: v, kind: 'default.obj-fn' });
              }
            }
          }
        } catch {
          /* best-effort */
        }
      }
      // Try in order
      for (const c of candidates) {
        const out = await tryCall(c.fn, c.kind);
        if (out) {
          engine = out;
          break;
        }
      }

      // As a last‑resort, walk nested defaults a couple of levels to catch exotic shapes.
      if (!engine) {
        const seen = new Set<unknown>();
        const walk = (obj: unknown, depth = 0): void => {
          if (!obj || seen.has(obj) || depth > 3) return;
          seen.add(obj);
          if (typeof obj === 'function')
            candidates.push({
              fn: obj,
              kind: 'nested.fn',
            });

          if (typeof obj !== 'object' && typeof obj !== 'function') return;
          const o = obj as { [k: string]: unknown };
          if (typeof o.resolveEffectiveEngineConfig === 'function')
            candidates.push({
              fn: o.resolveEffectiveEngineConfig,
              kind: 'nested.resolve',
            });
          if ('default' in o) walk(o.default, depth + 1);
        };
        walk(mod);
        for (const c of candidates) {
          const out = await tryCall(
            (c as { fn: unknown; kind?: string }).fn ?? c,
            (c as { kind?: string }).kind ?? 'nested-fn',
          );
          if (out) {
            engine = out;
            break;
          }
        }
        if (!engine) throw new Error('resolveEffectiveEngineConfig not found');
      }
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
}
