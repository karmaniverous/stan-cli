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

    // Wait until we observe at least one [RUN] frame.
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

    // While running, latest update frames containing [RUN] must also include the hint.
    const framesWithRun = updates().filter(
      (u) => rowRe.test(u.body) && /\[RUN\]/.test(u.body),
    );
    // There should be at least one RUN frame by now (guard above waited for it).
    expect(framesWithRun.length).toBeGreaterThan(0);
    // The hint should be present in RUN frames ("Press q to cancel, r to restart")
    expect(
      framesWithRun.every((f) =>
        /Press q to cancel,\s*r to restart/i.test(f.body),
      ),
    ).toBe(true);
    // Trigger restart ('r'); this should cause a single header-only flush (persist header) and then a new session.
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
    // Any row line starts with either "script" or "archive"
    const anyRowRe = rowRe; // restrict to this suite's script row

    const ups = updates();
    const headerOnlyUpdates = ups.filter(
      (u) => headerRe.test(u.body) && !anyRowRe.test(u.body),
    );

    // Exactly one header-only frame (from showHeaderOnly on restart)
    expect(headerOnlyUpdates.length).toBe(1);

    // Sanity: we should also have at least one frame with script/archive rows and the hint.
    const framesWithRows = ups.filter(
      (u) => headerRe.test(u.body) && rowRe.test(u.body),
    );
    expect(framesWithRows.length).toBeGreaterThan(0);
    expect(
      framesWithRows.some((u) =>
        /Press q to cancel,\s*r to restart/i.test(u.body),
      ),
    ).toBe(true);
  });
});
