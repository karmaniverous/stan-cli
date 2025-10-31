// src/runner/run/session/run-session/steps/cancel-check.ts
import {
  type CancelDeps,
  checkCancelNow,
  settleAndCheckCancel,
  yieldAndCheckCancel,
} from '@/runner/run/session/run-session/guards';
import type { SessionOutcome } from '@/runner/run/session/types';

export type CancelCtlLike = {
  isCancelled(): boolean;
  isRestart(): boolean;
};

/** Run the standard cancellation guard sequence; return an outcome when cancelling/restarting. */
export async function runAllCancelGuards(
  cancelCtl: CancelCtlLike,
  deps: CancelDeps,
): Promise<SessionOutcome | null> {
  const now = await checkCancelNow(cancelCtl, deps);
  if (now) return now;
  const afterYield = await yieldAndCheckCancel(cancelCtl, deps);
  if (afterYield) return afterYield;
  const afterSettle = await settleAndCheckCancel(cancelCtl, deps);
  return afterSettle;
}
