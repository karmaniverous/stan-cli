import type { ContextConfig } from '@karmaniverous/stan-core';

import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import { DBG_SCOPE_RUN_ENGINE_LEGACY } from '@/runner/util/debug-scopes';

// Lazy resolver for CLI config (named-or-default) at action time.
export const loadCliConfigSyncLazy = async (
  dir: string,
): Promise<{
  scripts?: Record<string, unknown>;
  cliDefaults?: Record<string, unknown>;
  patchOpenCommand?: string;
  maxUndos?: number;
  devMode?: boolean;
}> => {
  try {
    const mod = (await import('@/cli/config/load')) as unknown as {
      loadCliConfigSync?: (cwd: string) => unknown;
      default?:
        | { loadCliConfigSync?: (cwd: string) => unknown }
        | ((cwd: string) => unknown);
    };
    const named = (mod as { loadCliConfigSync?: unknown }).loadCliConfigSync;
    const viaDefaultObj = (mod as { default?: { loadCliConfigSync?: unknown } })
      .default?.loadCliConfigSync;
    const viaDefaultFn = (mod as { default?: unknown }).default;
    const fn =
      typeof named === 'function'
        ? (named as (cwd: string) => unknown)
        : typeof viaDefaultObj === 'function'
          ? (viaDefaultObj as (cwd: string) => unknown)
          : typeof viaDefaultFn === 'function'
            ? (viaDefaultFn as (cwd: string) => unknown)
            : null;
    const out = fn ? (fn(dir) as Record<string, unknown>) : {};
    return out as {
      scripts?: Record<string, unknown>;
      cliDefaults?: Record<string, unknown>;
      patchOpenCommand?: string;
      maxUndos?: number;
      devMode?: boolean;
    };
  } catch {
    return {};
  }
};

// Lazy resolver for the effective engine config (named-or-default at action time).
export const resolveEngineConfigLazy = async (
  cwd: string,
): Promise<ContextConfig> => {
  try {
    const mod = (await import('@/runner/config/effective')) as unknown;
    const fn = resolveNamedOrDefaultFunction<
      (cwd: string, scope?: string) => Promise<ContextConfig>
    >(
      mod,
      (m) =>
        (
          m as {
            resolveEffectiveEngineConfig?: (
              c: string,
              s?: string,
            ) => Promise<ContextConfig>;
          }
        ).resolveEffectiveEngineConfig,
      (m) =>
        (
          m as {
            default?: {
              resolveEffectiveEngineConfig?: (
                c: string,
                s?: string,
              ) => Promise<ContextConfig>;
            };
          }
        ).default?.resolveEffectiveEngineConfig,
      'resolveEffectiveEngineConfig',
    );
    return await fn(cwd, DBG_SCOPE_RUN_ENGINE_LEGACY);
  } catch {
    // Safe fallback: minimal config (stanPath only).
    try {
      const core = await import('@karmaniverous/stan-core');
      const sp =
        typeof core.resolveStanPathSync === 'function'
          ? core.resolveStanPathSync(cwd)
          : '.stan';
      return { stanPath: sp } as ContextConfig;
    } catch {
      return { stanPath: '.stan' } as ContextConfig;
    }
  }
};

// Typed resolver for overlay builder (named-or-default; SSR-robust)
export type BuildOverlayInputsFn =
  (typeof import('./overlay'))['buildOverlayInputs'];

/** Resolve the overlay inputs builder at action-time (SSR/mocks-robust). */
export const loadBuildOverlayInputs =
  async (): Promise<BuildOverlayInputsFn> => {
    const mod = (await import('./overlay')) as unknown as {
      buildOverlayInputs?: unknown;
      default?:
        | { buildOverlayInputs?: unknown }
        | ((...a: unknown[]) => unknown);
    };
    try {
      return resolveNamedOrDefaultFunction<BuildOverlayInputsFn>(
        mod as unknown,
        (m) => (m as { buildOverlayInputs?: unknown }).buildOverlayInputs,
        (m) =>
          (m as { default?: { buildOverlayInputs?: unknown } }).default
            ?.buildOverlayInputs,
        'buildOverlayInputs',
      );
    } catch (e) {
      // Fallbacks: default-as-function, shallow scans (SSR/mocks)
      try {
        const defAny = (mod as { default?: unknown }).default;
        if (typeof defAny === 'function')
          return defAny as unknown as BuildOverlayInputsFn;
        if (defAny && typeof defAny === 'object') {
          for (const v of Object.values(defAny as Record<string, unknown>)) {
            if (typeof v === 'function')
              return v as unknown as BuildOverlayInputsFn;
          }
        }
      } catch {
        /* ignore; continue */
      }
      try {
        for (const v of Object.values(mod as Record<string, unknown>)) {
          if (typeof v === 'function') return v as BuildOverlayInputsFn;
        }
      } catch {
        /* ignore and rethrow original */
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  };

// SSR‑robust loader for deriveRunParameters (named-or-default; last-chance default=function)
export const loadDeriveRunParameters = async (): Promise<
  typeof import('../derive').deriveRunParameters
> => {
  const mod = (await import('../derive')) as unknown as {
    deriveRunParameters?: unknown;
    default?:
      | Partial<typeof import('../derive')>
      | ((
          ...args: Parameters<
            (typeof import('../derive'))['deriveRunParameters']
          >
        ) => ReturnType<(typeof import('../derive'))['deriveRunParameters']>);
  };
  const viaNamed = (mod as { deriveRunParameters?: unknown })
    .deriveRunParameters;
  if (typeof viaNamed === 'function')
    return viaNamed as (typeof import('../derive'))['deriveRunParameters'];
  const viaDefaultObj = (
    mod as { default?: Partial<typeof import('../derive')> }
  ).default?.deriveRunParameters;
  if (typeof viaDefaultObj === 'function') return viaDefaultObj;
  const viaDefaultFn =
    typeof (mod as { default?: unknown }).default === 'function'
      ? ((
          mod as {
            default?: (
              ...a: Parameters<
                (typeof import('../derive'))['deriveRunParameters']
              >
            ) => ReturnType<
              (typeof import('../derive'))['deriveRunParameters']
            >;
          }
        ).default as (typeof import('../derive'))['deriveRunParameters'])
      : undefined;
  if (typeof viaDefaultFn === 'function') return viaDefaultFn;
  // 4) nested default.default function (edge SSR wrappers)
  try {
    const nested = (
      mod as {
        default?: { default?: unknown };
      }
    ).default?.default;
    if (typeof nested === 'function') {
      return nested as unknown as (typeof import('../derive'))['deriveRunParameters'];
    }
  } catch {
    /* ignore */
  }
  // 5) module-as-function (rare mocks)
  try {
    if (typeof (mod as unknown) === 'function') {
      return mod as unknown as (typeof import('../derive'))['deriveRunParameters'];
    }
  } catch {
    /* ignore */
  }
  // 6) scan default object for any callable property (last resort)
  try {
    const d = (mod as { default?: unknown }).default;
    if (d && typeof d === 'object') {
      for (const v of Object.values(d as Record<string, unknown>)) {
        if (typeof v === 'function') {
          return v as unknown as (typeof import('../derive'))['deriveRunParameters'];
        }
      }
    }
  } catch {
    /* ignore */
  }
  // 7) scan top-level module for any callable (extreme edge mock)
  try {
    const entries = Object.values((mod as Record<string, unknown>) ?? {});
    for (const v of entries) {
      if (typeof v === 'function') {
        return v as unknown as (typeof import('../derive'))['deriveRunParameters'];
      }
    }
  } catch {
    /* ignore */
  }
  throw new Error('deriveRunParameters not found');
};

// Default export for SSR/default-shaped consumers.
export default {
  loadCliConfigSyncLazy,
  resolveEngineConfigLazy,
  loadDeriveRunParameters,
};
