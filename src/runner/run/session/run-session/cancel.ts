// src/runner/run/session/run-session/cancel.ts
import type { ProcessSupervisor } from '@/runner/run/live/supervisor';
import type { SessionOutcome } from '@/runner/run/session/types';
import type { RunnerUI } from '@/runner/run/ui';

import { pauseStdin, removeArchivesIfAny, settle, win32 } from './cleanup';

/**
 + Common cancelled-return path.
 + - Removes any archives best‑effort (belt‑and‑suspenders).
 + - Stops UI and settles supervisor.
 + - Detaches signals and pauses stdin.
 */
export const cancelAndReturn = async (args: {
  created: string[];
  ui: RunnerUI;
  supervisor: ProcessSupervisor;
  detachSignals: () => void;
  liveEnabled: boolean;
  outAbs: string;
}): Promise<SessionOutcome> => {
  const { created, ui, supervisor, detachSignals, liveEnabled, outAbs } = args;
  await removeArchivesIfAny(outAbs).catch(() => void 0);
  try {
    ui.stop();
  } catch {
    /* ignore */
  }
  if (liveEnabled) {
    try {
      console.log('');
    } catch {
      /* ignore */
    }
  }
  try {
    await supervisor.waitAll(3000);
  } catch {
    /* ignore */
  }
  pauseStdin();
  // Small platform‑aware settle for visibility + handle release.
  try {
    await settle(win32() ? 160 : 40);
  } catch {
    /* ignore */
  }
  try {
    detachSignals();
  } catch {
    /* ignore */
  }
  return { created, cancelled: true, restartRequested: false };
};

/** Restart path: detach signals and hand control back to caller. */
export const restartAndReturn = (args: {
  created: string[];
  detachSignals: () => void;
}): SessionOutcome => {
  try {
    args.detachSignals();
  } catch {
    /* ignore */
  }
  return { created: args.created, cancelled: true, restartRequested: true };
};
