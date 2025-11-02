// src/runner/run/session/run-session/guards.ts
import { yieldToEventLoop } from '@/runner/run/exec/util';
import type { ProcessSupervisor } from '@/runner/run/live/supervisor';
import type { SessionOutcome } from '@/runner/run/session/types';
import type { RunnerUI } from '@/runner/run/ui';

import { cancelAndReturn, restartAndReturn } from './cancel';
import { settle, win32 } from './cleanup';

export type CancelDeps = {
  created: string[];
  ui: RunnerUI;
  supervisor: ProcessSupervisor;
  detachSignals: () => void;
  liveEnabled: boolean;
  outAbs: string;
};

export type CancelCtl = {
  isCancelled(): boolean;
  isRestart(): boolean;
};

/** Immediate check for cancel/restart. Returns a SessionOutcome or null to continue. */
export async function checkCancelNow(
  cancelCtl: CancelCtl,
  deps: CancelDeps,
): Promise<SessionOutcome | null> {
  if (cancelCtl.isCancelled() && !cancelCtl.isRestart()) {
    return await cancelAndReturn(deps);
  }
  if (cancelCtl.isRestart()) {
    return restartAndReturn({
      created: deps.created,
      detachSignals: deps.detachSignals,
    });
  }
  return null;
}

/** Yield once then check cancellation. */
export async function yieldAndCheckCancel(
  cancelCtl: CancelCtl,
  deps: CancelDeps,
): Promise<SessionOutcome | null> {
  try {
    await yieldToEventLoop();
  } catch {
    /* ignore */
  }
  return checkCancelNow(cancelCtl, deps);
}

/** Short settle + yield and re-check (secondary late-cancel guard). */
export async function settleAndCheckCancel(
  cancelCtl: CancelCtl,
  deps: CancelDeps,
): Promise<SessionOutcome | null> {
  try {
    await settle(win32() ? 25 : process.env.CI ? 20 : 10);
    await yieldToEventLoop();
  } catch {
    /* ignore */
  }
  return checkCancelNow(cancelCtl, deps);
}

/** Guard right before scheduling the archive stage (absorbs just‑arrived keypress on slower FS). */
export async function preArchiveScheduleGuard(
  cancelCtl: CancelCtl,
  deps: CancelDeps,
): Promise<SessionOutcome | null> {
  try {
    await yieldToEventLoop();
  } catch {
    /* ignore */
  }
  const early = await checkCancelNow(cancelCtl, deps);
  if (early) return early;
  try {
    await settle(win32() ? 300 : 30);
  } catch {
    /* ignore */
  }
  return checkCancelNow(cancelCtl, deps);
}
