// src/runner/run/session/run-session/cancel.ts
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

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
  // Belt-and-suspenders: robust archive removal with small bounded retries.
  const tarP = resolvePath(outAbs, 'archive.tar');
  const diffP = resolvePath(outAbs, 'archive.diff.tar');
  const gone = (): boolean => !existsSync(tarP) && !existsSync(diffP);
  const tryRemove = async (): Promise<void> => {
    await removeArchivesIfAny(outAbs).catch(() => void 0);
  };
  // First attempt (best-effort)
  await tryRemove();
  if (!gone()) {
    // Short series of small settles to absorb lingering handles (Windows skewed).
    const maxTries = win32() ? 10 : 6;
    for (let i = 0; i < maxTries; i += 1) {
      await settle(win32() ? 200 : 40);
      await tryRemove();
      if (gone()) break;
    }
    // Final tiny settle for visibility before proceeding.
    try {
      await settle(win32() ? 120 : 25);
    } catch {
      /* ignore */
    }
  }

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
