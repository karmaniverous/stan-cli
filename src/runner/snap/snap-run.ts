// src/runner/snap/snap-run.ts
/**
 * Snap entry point — creates/updates the diff snapshot (optionally with stash).
 * SSR-robust: resolves captureSnapshotAndArchives at call time to tolerate
 * named/default export shape differences under Vitest SSR/bundlers.
 */

import { resolveStanPathSync } from '@karmaniverous/stan-core';

import { utcStamp } from '@/runner/util/time';

/** Dynamic resolver for './capture'.captureSnapshotAndArchives */
type CaptureFn = (args: {
  cwd: string;
  stanPath: string;
  ts: string;
  maxUndos: number;
}) => Promise<void>;

const resolveCaptureSnapshotAndArchives = async (): Promise<CaptureFn> => {
  const modUnknown: unknown = await import('./capture');

  // 1) named export
  try {
    const named = (modUnknown as { captureSnapshotAndArchives?: unknown })
      .captureSnapshotAndArchives;
    if (typeof named === 'function') return named as CaptureFn;
  } catch {
    /* ignore */
  }

  // 2) default.captureSnapshotAndArchives
  try {
    const viaDefaultObj = (
      modUnknown as { default?: { captureSnapshotAndArchives?: unknown } }
    ).default?.captureSnapshotAndArchives;
    if (typeof viaDefaultObj === 'function') return viaDefaultObj as CaptureFn;
  } catch {
    /* ignore */
  }

  // 3) default as function
  try {
    const dAny = (modUnknown as { default?: unknown }).default;
    if (typeof dAny === 'function') {
      return dAny as unknown as {
        (...a: unknown[]): Promise<unknown>;
      } as unknown as CaptureFn;
    }
  } catch {
    /* ignore */
  }

  // 4) nested default.default as function (some mock shapes)
  try {
    const nestedDefault = (
      modUnknown as {
        default?: { default?: unknown };
      }
    ).default?.default;
    if (typeof nestedDefault === 'function')
      return nestedDefault as unknown as CaptureFn;
  } catch {
    /* ignore */
  }

  // 5) module itself as function
  try {
    if (typeof modUnknown === 'function') return modUnknown as CaptureFn;
  } catch {
    /* ignore */
  }

  // 6) scan default object for any callable property (last resort)
  try {
    const d = (modUnknown as { default?: unknown }).default;
    if (d && typeof d === 'object') {
      for (const v of Object.values(d as Record<string, unknown>)) {
        if (typeof v === 'function') return v as CaptureFn;
      }
    }
  } catch {
    /* ignore */
  }

  throw new Error('captureSnapshotAndArchives not found in "./capture"');
};

/**
 * Handle `stan snap`:
 * - Optionally stashes (git stash -u) before snapshot and pops after.
 * - Writes/updates <stanPath>/diff/.archive.snapshot.json via capture layer.
 */
export async function handleSnap(opts?: { stash?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const stanPath = resolveStanPathSync(cwd);

  // If stashing is requested, attempt it first. Abort on failure (no snapshot/history).
  if (opts?.stash) {
    try {
      const gitMod = (await import('./git')) as unknown as {
        runGit?: (
          cwd: string,
          args: string[],
        ) => Promise<{
          code: number;
          stdout: string;
          stderr: string;
        }>;
      };
      if (typeof gitMod.runGit === 'function') {
        const res = await gitMod.runGit(cwd, ['stash', '-u']);
        if (!res || res.code !== 0) {
          return; // abort: stash failed
        }
      }
    } catch {
      return; // abort on unexpected stash error
    }
  }

  // Deterministically write/refresh the diff snapshot before capturing to history.
  // SSR-robust: resolve core helpers at call time; tolerate named/default export shapes.
  try {
    const coreModUnknown: unknown = await import('@karmaniverous/stan-core');
    const core = coreModUnknown as {
      loadConfig?: (cwd: string) => Promise<{
        stanPath: string;
        includes?: string[];
        excludes?: string[];
      }>;
      writeArchiveSnapshot?: (args: {
        cwd: string;
        stanPath: string;
        includes?: string[];
        excludes?: string[];
      }) => Promise<string>;
      default?: {
        loadConfig?: (cwd: string) => Promise<{
          stanPath: string;
          includes?: string[];
          excludes?: string[];
        }>;
        writeArchiveSnapshot?: (args: {
          cwd: string;
          stanPath: string;
          includes?: string[];
          excludes?: string[];
        }) => Promise<string>;
      };
    };
    const loadConfigFn =
      typeof core.loadConfig === 'function'
        ? core.loadConfig
        : typeof core.default?.loadConfig === 'function'
          ? core.default.loadConfig
          : null;
    const writeSnapshotFn =
      typeof core.writeArchiveSnapshot === 'function'
        ? core.writeArchiveSnapshot
        : typeof core.default?.writeArchiveSnapshot === 'function'
          ? core.default.writeArchiveSnapshot
          : null;
    if (writeSnapshotFn) {
      let includes: string[] = [];
      let excludes: string[] = [];
      try {
        const cfg = loadConfigFn ? await loadConfigFn(cwd) : null;
        includes = Array.isArray(cfg?.includes) ? cfg.includes : [];
        excludes = Array.isArray(cfg?.excludes) ? cfg.excludes : [];
      } catch {
        // best-effort
        includes = [];
        excludes = [];
      }
      await writeSnapshotFn({ cwd, stanPath, includes, excludes });
    }
  } catch {
    // best-effort: capturing still proceeds even if snapshot write fails
  }

  // Resolve effective context (cwd/stanPath/maxUndos)
  let ctx: { cwd: string; stanPath: string; maxUndos: number } = {
    cwd,
    stanPath,
    maxUndos: 10,
  };
  try {
    const ctxMod = (await import('@/runner/snap/context')) as {
      resolveContext?: (c: string) => Promise<{
        cwd: string;
        stanPath: string;
        maxUndos: number;
      }>;
    };
    if (typeof ctxMod.resolveContext === 'function') {
      ctx = await ctxMod.resolveContext(cwd);
    }
  } catch {
    /* keep best-effort defaults */
  }

  const capture = await resolveCaptureSnapshotAndArchives();
  // Final stanPath guard: if context failed to provide a non-empty path,
  // fall back to resolveStanPathSync(cwd) to avoid undefined joins.
  const stanPathEffective =
    typeof ctx.stanPath === 'string' && ctx.stanPath.trim().length > 0
      ? ctx.stanPath
      : resolveStanPathSync(cwd);
  await capture({
    cwd: ctx.cwd,
    stanPath: stanPathEffective,
    ts: utcStamp(),
    maxUndos: ctx.maxUndos,
  });

  // Best‑effort: pop stash after capture when requested.
  if (opts?.stash) {
    try {
      const gitMod = (await import('./git')) as unknown as {
        runGit?: (
          cwd: string,
          args: string[],
        ) => Promise<{
          code: number;
          stdout: string;
          stderr: string;
        }>;
      };
      await gitMod.runGit?.(cwd, ['stash', 'pop']);
    } catch {
      /* ignore */
    }
  }
}
