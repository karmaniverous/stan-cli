// src/runner/run/session/run-session/cleanup.ts
import { rm } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

/**
 + Best-effort removal of any archives that may exist under <outAbs>/.
 + Idempotent and safe across platforms.
 */
export const removeArchivesIfAny = async (outAbs: string): Promise<void> => {
  const tar = resolvePath(outAbs, 'archive.tar');
  const diff = resolvePath(outAbs, 'archive.diff.tar');
  await Promise.allSettled([
    rm(tar, { force: true }),
    rm(diff, { force: true }),
  ]);
};

/** Small sleep helper (ms). */
export const settle = async (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** Pause stdin best‑effort (guards SSR/test shapes). */
export const pauseStdin = (): void => {
  try {
    (process.stdin as unknown as { pause?: () => void }).pause?.();
  } catch {
    /* ignore */
  }
};

export const win32 = (): boolean => process.platform === 'win32';
