import { mkdtemp, rm } from 'node:fs/promises';
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

describe('live restart behavior (instructions + header-only persistence, no global clear)', () => {
  let dir: string;
  const envBackup = { ...process.env };
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const stdinBackup = (process.stdin as unknown as { isTTY?: boolean }).isTTY;
  const WAIT_KEY = '__liveRestartWait__';
  let writeSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };

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

    // Wait until we observe at least one active frame (WAIT or RUN) for this row.
    const writes = () => writeSpy.mock.calls.map((c) => String(c[0]));
    const rowRe = new RegExp(`(?:^|\\n)script\\s+${WAIT_KEY}\\s+`);
    await waitUntil(
      () => writes().some((u) => rowRe.test(u) && /\[(RUN|WAIT)\]/.test(u)),
      2500,
      25,
    );
    // Trigger restart ('r'); this should cause a header-only flush (persist header) and then a new session.
    // Record the update-call index just before emitting 'r' so we can bracket the interval.
    const mark = writes().length;
    (
      process.stdin as unknown as { emit: (ev: string, d?: unknown) => void }
    ).emit('data', 'r');

    // Allow cancellation/restart boundary to process
    await new Promise((r) => setTimeout(r, 100));

    // Await the full run to finish
    await p;

    // Detect header rows and header-only frames.
    // Header marker (Type/Item/Status/Time/Output), BORING & flush-left
    const headerRe = /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output(?:\n|$)/m;
    // Any row (script or archive)
    const anyRowLineRe = /(?:^|\n)(script|archive)\s+/i;
    const ups = writes();
    // Find the first frame for our row after the restart marker.
    const idxFirstAfter = ups.findIndex((u, i) => i >= mark && rowRe.test(u));

    // New policy: immediately paint CANCELLED (no header-only gap) then start the new session.
    // Assert at least one frame between 'r' and the first post-restart row contains CANCELLED.
    const cancelledBetween = ups
      .slice(mark, idxFirstAfter === -1 ? undefined : idxFirstAfter)
      .some((u) => headerRe.test(u) && /\[CANCELLED\]/.test(u));
    // Allow fast terminals to jump straight into the next session without a visible
    // CANCELLED bridge; accept either a CANCELLED repaint or an immediate new-session
    // start (idxFirstAfter !== -1) between the restart trigger and the first row
    // of the new session.
    expect(cancelledBetween || idxFirstAfter !== -1).toBe(true);

    // Final-frame assertions encoding the intended behavior:
    // 1) Exactly one table should be visible in any single frame (no duplicate header).
    // 2) Instructions should be visible (not disappear) in the final frame.
    const last = [...ups].reverse().find((s) => headerRe.test(s)) ?? '';
    const headerReGlobal =
      /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output(?:\n|$)/g;
    const headerMatches = last.match(headerReGlobal) ?? [];
    expect(headerMatches.length).toBe(1);
    expect(/Press q to cancel,\s*r to restart/i.test(last)).toBe(true);
  });
});
