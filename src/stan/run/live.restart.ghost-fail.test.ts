import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rmDirWithRetries } from '@/test/helpers';

// Keep archiving light (we don't archive in this test, but safe to mock)
vi.mock('tar', () => ({
  __esModule: true,
  default: undefined,
  create: async ({ file }: { file: string }) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'TAR', 'utf8');
  },
}));

// Capture log-update frames and side-channel methods for verification.
type LogUpdateCall =
  | { type: 'update'; body: string }
  | { type: 'clear' }
  | { type: 'done' };
const calls: LogUpdateCall[] = [];

// Hoisted mock for log-update
vi.mock('log-update', () => {
  const impl = (s: string) => {
    try {
      calls.push({ type: 'update', body: String(s) });
      (process.stdout as unknown as { write: (chunk: string) => void }).write(
        String(s),
      );
    } catch {
      // ignore
    }
  };
  (impl as unknown as { clear?: () => void }).clear = () => {
    calls.push({ type: 'clear' });
  };
  (impl as unknown as { done?: () => void }).done = () => {
    calls.push({ type: 'done' });
  };
  return { __esModule: true, default: impl };
});

import { runSelected } from '@/stan/run';

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
    calls.length = 0;
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
    await rmDirWithRetries(dir);
    vi.restoreAllMocks();
  });

  it('after pressing r, no [FAIL] appears for a script before it starts in the new session (should fail today)', async () => {
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

    const updates = () =>
      calls.filter(
        (c): c is { type: 'update'; body: string } => c.type === 'update',
      );
    const rowRe = new RegExp(`(?:^|\\n)script\\s+${FAIL_KEY}\\s+`);

    // Wait until FAIL_KEY is running in the first session.
    await waitUntil(
      () => updates().some((u) => rowRe.test(u.body) && /\[RUN\]/.test(u.body)),
      2500,
      25,
    );

    // Mark current updates index, then trigger restart while the script is running.
    const mark = updates().length;
    (
      process.stdin as unknown as { emit: (ev: string, d?: unknown) => void }
    ).emit('data', 'r');

    // Allow the restart boundary to process and the prior child to terminate with exit(1).
    await new Promise((r) => setTimeout(r, 150));

    // Await the full run to finish (second session completes too).
    await p;

    // Analyze frames between the restart marker and the first appearance of FAIL_KEY in the new session.
    const ups = updates();
    // First frame for FAIL_KEY after restart (could be [WAIT] or [RUN])
    const idxFirstRowAfter = ups.findIndex(
      (u, i) => i >= mark && rowRe.test(u.body),
    );
    expect(idxFirstRowAfter).toBeGreaterThan(-1);

    // In the slice strictly between restart mark and the first post-restart row frame,
    // assert we do NOT render a [FAIL] for this script (ghost end-state).
    const ghostFailBeforeRow = ups
      .slice(mark, idxFirstRowAfter)
      .some((u) => rowRe.test(u.body) && /\[FAIL\]/.test(u.body));

    // EXPECTED (intended fix): false
    // CURRENT (buggy): often true, due to stale onEnd from the previous session.
    expect(ghostFailBeforeRow).toBe(false);
  });
});
