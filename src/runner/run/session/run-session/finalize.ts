// src/runner/run/session/run-session/finalize.ts
import { yieldToEventLoop } from '@/runner/run/exec/util';
import type { RunnerUI } from '@/runner/run/ui';

/** Small post-archive settle to stabilize FS visibility across platforms/CI. */
export const postArchiveSettle = async (): Promise<void> => {
  try {
    const ms = process.platform === 'win32' ? 140 : process.env.CI ? 25 : 15;
    await new Promise((r) => setTimeout(r, ms));
    await yieldToEventLoop();
  } catch {
    /* ignore */
  }
};

/** Force an immediate, one-time flush of the current table state (idempotent). */
export const flushUiOnce = async (ui: RunnerUI): Promise<void> => {
  try {
    await yieldToEventLoop();
  } catch {
    /* ignore */
  }
  try {
    const flush = (ui as unknown as { flushNow?: () => void }).flushNow;
    if (typeof flush === 'function') flush();
  } catch {
    /* ignore */
  }
};
