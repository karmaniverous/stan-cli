// src/cli/snap/handlers.ts
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';

type SnapHandler = (...a: unknown[]) => Promise<void>;

// NOTE: This loader is intentionally SSR‑robust to tolerate exotic mock shapes.
type SnapRunModule = typeof import('@/runner/snap/snap-run');
type HistoryModule = typeof import('@/runner/snap/history');
type HandleSnapFn = SnapRunModule['handleSnap'];
type HandleUndoFn = HistoryModule['handleUndo'];
type HandleRedoFn = HistoryModule['handleRedo'];
type HandleSetFn = HistoryModule['handleSet'];
type HandleInfoFn = HistoryModule['handleInfo'];

/**
 * SSR‑robust loader for snap handlers from concrete modules.
 * Falls back to default function or barrel shapes common in tests.
 */
export async function loadSnapHandler(
  name: 'handleSnap' | 'handleUndo' | 'handleRedo' | 'handleSet' | 'handleInfo',
): Promise<SnapHandler> {
  if (name === 'handleSnap') {
    const mod = (await import('@/runner/snap/snap-run')) as unknown;
    try {
      const fn = resolveNamedOrDefaultFunction<HandleSnapFn>(
        mod,
        (m) => (m as SnapRunModule).handleSnap,
        (m) => (m as { default?: Partial<SnapRunModule> }).default?.handleSnap,
        'handleSnap',
      );
      return fn as SnapHandler;
    } catch (e) {
      // 1) default export is a callable function
      try {
        const d = (mod as { default?: unknown }).default;
        if (typeof d === 'function') return d as SnapHandler;
      } catch {
        /* ignore */
      }
      // 2) default export object exposing handleSnap
      try {
        const dh = (mod as { default?: { handleSnap?: unknown } }).default
          ?.handleSnap;
        if (typeof dh === 'function') return dh as SnapHandler;
      } catch {
        /* ignore */
      }
      // 3) nested default.default function (edge SSR)
      try {
        const nested = (mod as { default?: { default?: unknown } }).default
          ?.default;
        if (typeof nested === 'function') return nested as SnapHandler;
      } catch {
        /* ignore */
      }
      // 4) module‑as‑function (rare mocks)
      try {
        if (typeof mod === 'function') {
          return mod as unknown as SnapHandler;
        }
      } catch {
        /* ignore */
      }
      // 5) scan default object for any callable property (last resort)
      try {
        const d = (mod as { default?: unknown }).default;
        if (d && typeof d === 'object') {
          for (const v of Object.values(d as Record<string, unknown>)) {
            if (typeof v === 'function') return v as SnapHandler;
          }
        }
      } catch {
        /* ignore */
      }
      // 5a) scan top-level module for any callable property (edge mocks)
      try {
        const entries = Object.values((mod as Record<string, unknown>) ?? {});
        for (const v of entries) {
          if (typeof v === 'function') return v as SnapHandler;
        }
      } catch {
        /* ignore */
      }
      // 6) Barrel fallback for SSR/test bundling reshapes
      try {
        const barrel = (await import('@/runner/snap')) as unknown as {
          handleSnap?: unknown;
          default?:
            | { handleSnap?: unknown }
            | ((...a: unknown[]) => Promise<void>);
        };
        const viaNamed = (barrel as { handleSnap?: unknown }).handleSnap;
        const viaDefaultObj =
          (barrel as { default?: { handleSnap?: unknown } }).default
            ?.handleSnap ?? undefined;
        const viaDefaultFn =
          typeof (barrel as { default?: unknown }).default === 'function'
            ? ((
                barrel as {
                  default?: (...a: unknown[]) => Promise<void>;
                }
              ).default as SnapHandler)
            : undefined;
        let resolved: SnapHandler | undefined =
          (typeof viaNamed === 'function'
            ? (viaNamed as SnapHandler)
            : undefined) ??
          (typeof viaDefaultObj === 'function'
            ? (viaDefaultObj as SnapHandler)
            : undefined) ??
          viaDefaultFn;

        // Extra barrel fallbacks mirroring above
        if (!resolved) {
          try {
            const bNested = (
              barrel as {
                default?: { default?: unknown };
              }
            ).default?.default;
            if (typeof bNested === 'function')
              resolved = bNested as SnapHandler;
          } catch {
            /* ignore */
          }
        }
        if (!resolved) {
          try {
            if (typeof (barrel as unknown) === 'function')
              resolved = barrel as unknown as SnapHandler;
          } catch {
            /* ignore */
          }
        }
        if (!resolved) {
          try {
            const bd = (barrel as { default?: unknown }).default;
            if (bd && typeof bd === 'object') {
              for (const v of Object.values(bd as Record<string, unknown>)) {
                if (typeof v === 'function') {
                  resolved = v as SnapHandler;
                  break;
                }
              }
            }
          } catch {
            /* ignore */
          }
        }
        // 6e) scan top-level barrel module for any callable (last-resort)
        try {
          const top = Object.values((barrel as Record<string, unknown>) ?? {});
          for (const v of top) {
            if (typeof v === 'function') return v as SnapHandler;
          }
        } catch {
          /* ignore */
        }
        if (resolved) return resolved;
      } catch {
        /* ignore; rethrow original */
      }
      throw e;
    }
  }

  const mod = (await import('@/runner/snap/history')) as unknown;
  if (name === 'handleUndo') {
    const fn = resolveNamedOrDefaultFunction<HandleUndoFn>(
      mod,
      (m) => (m as HistoryModule).handleUndo,
      (m) => (m as { default?: Partial<HistoryModule> }).default?.handleUndo,
      'handleUndo',
    );
    return fn as SnapHandler;
  }
  if (name === 'handleRedo') {
    const fn = resolveNamedOrDefaultFunction<HandleRedoFn>(
      mod,
      (m) => (m as HistoryModule).handleRedo,
      (m) => (m as { default?: Partial<HistoryModule> }).default?.handleRedo,
      'handleRedo',
    );
    return fn as SnapHandler;
  }
  if (name === 'handleSet') {
    const fn = resolveNamedOrDefaultFunction<HandleSetFn>(
      mod,
      (m) => (m as HistoryModule).handleSet,
      (m) => (m as { default?: Partial<HistoryModule> }).default?.handleSet,
      'handleSet',
    );
    return fn as SnapHandler;
  }
  const fn = resolveNamedOrDefaultFunction<HandleInfoFn>(
    mod,
    (m) => (m as HistoryModule).handleInfo,
    (m) => (m as { default?: Partial<HistoryModule> }).default?.handleInfo,
    'handleInfo',
  );
  return fn as SnapHandler;
}
