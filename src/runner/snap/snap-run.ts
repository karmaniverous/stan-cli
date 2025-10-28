// src/runner/snap/snap-run.ts
/**
 * Snap entry point — creates/updates the diff snapshot (optionally with stash).
 * SSR-robust: resolves captureSnapshotAndArchives at call time to tolerate
 * named/default export shape differences under Vitest SSR/bundlers.
 */

import path from 'node:path';

import { resolveStanPathSync } from '@karmaniverous/stan-core';

/** Dynamic resolver for './capture'.captureSnapshotAndArchives */
type CaptureFn = (args: {
  cwd: string;
  stanPath: string;
  historyDir: string;
  stash?: boolean;
}) => Promise<void>;

const resolveCaptureSnapshotAndArchives = async (): Promise<CaptureFn> => {
  const mod = (await import('./capture')) as unknown as {
    captureSnapshotAndArchives?: unknown;
    default?:
      | {
          captureSnapshotAndArchives?: unknown;
        }
      | ((...a: unknown[]) => Promise<unknown>);
  };

  const named = (mod as { captureSnapshotAndArchives?: unknown })
    .captureSnapshotAndArchives;
  if (typeof named === 'function') return named as CaptureFn;

  const viaDefaultObj = (
    mod as { default?: { captureSnapshotAndArchives?: unknown } }
  ).default?.captureSnapshotAndArchives;
  if (typeof viaDefaultObj === 'function') return viaDefaultObj as CaptureFn;

  const viaDefaultFn =
    typeof (mod as { default?: unknown }).default === 'function'
      ? ((mod as { default: (...a: unknown[]) => Promise<unknown> })
          .default as CaptureFn)
      : undefined;
  if (typeof viaDefaultFn === 'function') return viaDefaultFn;

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
  const historyDir = path.join(cwd, stanPath, 'diff');

  const capture = await resolveCaptureSnapshotAndArchives();
  await capture({
    cwd,
    stanPath,
    historyDir,
    stash: Boolean(opts?.stash),
  });
}
