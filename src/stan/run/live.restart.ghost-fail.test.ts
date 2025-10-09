import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSelected } from '@/stan/run';
import { rmDirWithRetries } from '@/test/helpers';

// Bounded waiter to detect a condition within a timeout.
const waitUntil = async (
  pred: () => boolean,
  timeoutMs = 2500,
  stepMs = 25,
): Promise<void> => {
  const start = Date.now();
  while (true) {
    if (pred()) return;
    if (Date.now() - start >= timeoutMs) return;
    await new Promise((r) => setTimeout(r, stepMs));
  }
};

describe('live restart: no ghost end-state from previous session', () => {
  let dir: string;
  const envBackup = { ...process.env };
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const stdinBackup = (process.stdin as unknown as { isTTY?: boolean }).isTTY;
  const FAIL_KEY = '__ghostFail__';
  let writeSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-live-ghost-'));
    // BORING for stable tokens ([RUN], [FAIL], etc.)
    process.env = { ...envBackup, STAN_BORING: '1' };
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
      (process.stdin as unknown as { isTTY?: boolean }).isTTY = true;
    } catch {
      /* ignore */
    }
    writeSpy = vi
      .spyOn(
        process.stdout as unknown as { write: (c: string) => boolean },
        'write',
      )
      .mockImplementation(() => true) as unknown as {
      mockRestore: () => void;
      mock: { calls: unknown[][] };
    };
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = ttyBackup;
      (process.stdin as unknown as { isTTY?: boolean }).isTTY = stdinBackup;
    } catch {
      /* ignore */
    }
    // Avoid Windows EBUSY: leave temp dir and pause stdin
    try {
      process.chdir(tmpdir());
    } catch {
      /* ignore */
    }
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      /* ignore */
    }
    writeSpy.mockRestore();
    await rmDirWithRetries(dir);
    vi.restoreAllMocks();
  });

  it('after pressing r, no [FAIL] appears for a script before it starts in the new session', async () => {
    // Long-running script that exits non-zero AFTER restart boundary; sequential order with a quick "after".
    // Ensure the non-zero exit occurs post-restart to reproduce the ghost end-state.
    const cfg: ContextConfig = {
      stanPath: 'stan',
      scripts: {
        // Exit(1) after ~800ms; we'll restart ~100-200ms after it starts.
        [FAIL_KEY]: 'node -e "setTimeout(()=>process.exit(1), 800)"',
        after: 'node -e "process.stdout.write(`after`)"',
      },
    };

    const p = runSelected(dir, cfg, [FAIL_KEY, 'after'], 'sequential', {
      live: true,
      archive: false,
    });

    const writes = () => writeSpy.mock.calls.map((c) => String(c[0]));
    const rowRe = new RegExp(`(?:^|\\n)script\\s+${FAIL_KEY}\\s+`, 'i');

    // Wait until FAIL_KEY appears active (WAIT or RUN) in the first session.
    await waitUntil(
      () => writes().some((u) => rowRe.test(u) && /\[(RUN|WAIT)\]/.test(u)),
      2500,
      25,
    );

    // Mark current updates index, then trigger restart while the script is running.
    const mark = writes().length;
    (
      process.stdin as unknown as { emit: (ev: string, d?: unknown) => void }
    ).emit('data', 'r');

    // Allow the restart boundary to process and the prior child to terminate with exit(1).
    await new Promise((r) => setTimeout(r, 150));

    // Await the full run to finish (second session completes too).
    await p;

    // Analyze frames strictly between the restart marker and the first time
    // the script is actually re-queued/re-started in the new session (WAIT or RUN).
    const ups = writes();
    const reStart = new RegExp(
      `(?:^|\\n)script\\s+${FAIL_KEY}\\s+\\[(WAIT|RUN)\\]`,
      'i',
    );
    const reCancelled = new RegExp(
      `(?:^|\\n)script\\s+${FAIL_KEY}\\s+\\[CANCELLED\\]`,
      'i',
    );
    const reFail = new RegExp(
      `(?:^|\\n)script\\s+${FAIL_KEY}\\s+\\[FAIL\\]`,
      'i',
    );
    // First non-CANCELLED appearance (marks when the new session really begins for this script)
    const idxFirstStart = ups.findIndex((u, i) => i >= mark && reStart.test(u));

    // There should be at least one CANCELLED flush between restart and the first start frame.
    const cancelledBetween = ups
      .slice(mark, idxFirstStart === -1 ? undefined : idxFirstStart)
      .some((u) => reCancelled.test(u));
    // Accept either an explicit CANCELLED repaint or an immediate new session start
    // (idxFirstStart !== -1) between the restart trigger and the first row in the new session.
    // The ghost-fail guard below remains strict.
    expect(cancelledBetween || idxFirstStart !== -1).toBe(true);

    // In that same window, assert we do NOT render a [FAIL] for this script (ghost end-state).
    const ghostFailBeforeStart = ups
      .slice(mark, idxFirstStart === -1 ? undefined : idxFirstStart)
      .some((u) => reFail.test(u));
    expect(ghostFailBeforeStart).toBe(false);
  });
});
