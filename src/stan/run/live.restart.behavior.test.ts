import { mkdtemp, rm } from 'node:fs/promises';
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

// hoisted mock for log-update
vi.mock('log-update', () => {
  const impl = (s: string) => {
    try {
      // record update calls and mirror to stdout like real log-update
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

describe('live restart behavior (instructions + header-only persistence, no global clear)', () => {
  let dir: string;
  const envBackup = { ...process.env };
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const stdinBackup = (process.stdin as unknown as { isTTY?: boolean }).isTTY;
  const WAIT_KEY = '__liveRestartWait__';

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-live-restart-'));
    // BORING for stable tokens ([RUN], etc.)
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
  it('keeps instructions visible while running, performs a single header-only flush on restart, and never calls clear()', async () => {
    // Small long-running script to ensure we can trigger a restart while "running"
    const cfg: ContextConfig = {
      stanPath: 'stan',
      scripts: {
        [WAIT_KEY]: 'node -e "setTimeout(()=>{}, 1200)"',
      },
    };

    // Kick off a live run (no archives to keep this fast)
    const p = runSelected(dir, cfg, [WAIT_KEY], 'concurrent', {
      live: true,
      archive: false,
    });

    // Wait until we observe at least one [RUN] frame for this test's row.
    const updates = () =>
      calls.filter(
        (c): c is { type: 'update'; body: string } => c.type === 'update',
      );
    const rowRe = new RegExp(`(?:^|\\n)script\\s+${WAIT_KEY}\\s+`);
    await waitUntil(
      () => updates().some((u) => rowRe.test(u.body) && /\[RUN\]/.test(u.body)),
      2500,
      25,
    );

    // While running, latest update frames for this row containing [RUN] must also include the hint.
    const framesWithRun = updates().filter(
      (u) => rowRe.test(u.body) && /\[RUN\]/.test(u.body),
    );
    expect(framesWithRun.length).toBeGreaterThan(0);
    expect(
      framesWithRun.every((f) =>
        /Press q to cancel,\s*r to restart/i.test(f.body),
      ),
    ).toBe(true);
    // Trigger restart ('r'); this should cause a header-only flush (persist header) and then a new session.
    // Record the update-call index just before emitting 'r' so we can bracket the interval.
    const mark = updates().length;
    (
      process.stdin as unknown as { emit: (ev: string, d?: unknown) => void }
    ).emit('data', 'r');

    // Allow cancellation/restart boundary to process
    await new Promise((r) => setTimeout(r, 100));

    // Await the full run to finish
    await p;

    // No global clear during the entire cycle
    expect(calls.some((c) => c.type === 'clear')).toBe(false);

    // Detect header rows and header-only frames.
    // Header marker (Type/Item/Status/Time/Output), BORING & flush-left
    const headerRe = /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output(?:\n|$)/m;
    // Any row line for this test's script
    const anyRowRe = rowRe;

    const ups = updates();
    // Find the first frame for our row after the restart marker.
    const idxFirstAfter = ups.findIndex(
      (u, i) => i >= mark && rowRe.test(u.body),
    );
    expect(idxFirstAfter).toBeGreaterThan(-1);

    // New policy: immediately paint CANCELLED (no header-only gap) then start the new session.
    // Assert at least one frame between 'r' and the first post-restart row contains CANCELLED.
    const cancelledBetween = ups
      .slice(mark, idxFirstAfter === -1 ? undefined : idxFirstAfter)
      .some(
        (u) =>
          /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output/m.test(u.body) &&
          /\[CANCELLED\]/.test(u.body),
      );
    expect(cancelledBetween).toBe(true);

    // Sanity: at least one post-restart frame for our row carries the hint.
    const postRestartRowFrames = ups.slice(Math.max(idxFirstAfter, mark));
    expect(
      postRestartRowFrames.some(
        (u) =>
          rowRe.test(u.body) &&
          /Press q to cancel,\s*r to restart/i.test(u.body),
      ),
    ).toBe(true);

    // Final-frame assertions encoding the intended behavior:
    // 1) Exactly one table should be visible in any single frame (no duplicate header).
    //    The current bug renders a second table under the first after restart,
    //    which yields 2 header lines within the same frame body.
    // 2) Instructions should be visible (not disappear) in the final frame.
    const last = ups.length > 0 ? ups[ups.length - 1].body : '';
    const headerReGlobal =
      /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output(?:\n|$)/g;
    const headerMatches = last.match(headerReGlobal) ?? [];
    // Expected (intended): 1; Current (buggy): typically >= 2 in one frame.
    expect(headerMatches.length).toBe(1);
    // Instructions must be present in the final frame.
    expect(/Press q to cancel,\s*r to restart/i.test(last)).toBe(true);
  });
});
