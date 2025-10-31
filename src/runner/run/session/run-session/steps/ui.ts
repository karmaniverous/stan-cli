// src/runner/run/session/run-session/steps/ui.ts
import type { RunnerUI } from '@/runner/run/ui';

/** Start UI and force an immediate first render (best-effort). */
export function startUiAndEnsureFirstFrame(ui: RunnerUI): void {
  ui.start();
  try {
    const flush = (ui as unknown as { flushNow?: () => void }).flushNow;
    if (typeof flush === 'function') flush();
  } catch {
    /* best-effort */
  }
}

/** Clear any prior session rows and reset internal UI state for the next session. */
export function prepareUiForNewSession(ui: RunnerUI): void {
  try {
    const prep = (ui as unknown as { prepareForNewSession?: () => void })
      .prepareForNewSession;
    if (typeof prep === 'function') prep();
  } catch {
    /* ignore */
  }
}

/** Optional immediate flush helper (best-effort). */
export function flushUiIfPossible(ui: RunnerUI): void {
  try {
    const flush = (ui as unknown as { flushNow?: () => void }).flushNow;
    if (typeof flush === 'function') flush();
  } catch {
    /* ignore */
  }
}
