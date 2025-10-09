import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSelected } from '@/stan/run';
import { stripAnsi } from '@/stan/run/live/format';

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

const updates = () =>
  calls.filter(
    (c): c is { type: 'update'; body: string } => c.type === 'update',
  );

// Bounded waiter to detect a condition within a timeout.
const waitUntil = async (
  pred: () => boolean,
  timeoutMs = 4500,
  stepMs = 25,
): Promise<void> => {
  const start = Date.now();
  while (true) {
    if (pred()) return;
    if (Date.now() - start >= timeoutMs) return;

    await new Promise((r) => setTimeout(r, stepMs));
  }
};

describe('live footer: trailing newline + stable hint across repaints', () => {
  let dir: string;
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const stdinBackup = (process.stdin as unknown as { isTTY?: boolean }).isTTY;
  const envBackup = { ...process.env };
  const HOLD = '__footerHold__';

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-live-footer-'));
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
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('BORING: final frame ends with \\n; hint persists across >=3 RUN repaints', async () => {
    // BORING for plain-text assertions.
    process.env.STAN_BORING = '1';

    // Long-running task (~3.2s) to allow >=3 repaint ticks (refresh ~1s).
    const cfg: ContextConfig = {
      stanPath: 'stan',
      scripts: {
        [HOLD]: 'node -e "setTimeout(()=>{}, 3200)"',
      },
    };

    const p = runSelected(dir, cfg, [HOLD], 'concurrent', {
      archive: false,
      live: true,
    });

    const rowRe = new RegExp(`(?:^|\\n)script\\s+${HOLD}\\s+`);
    // Wait until we observe >=3 frames for this row in [RUN].
    await waitUntil(() => {
      const ups = updates();
      const runFrames = ups.filter(
        (u) => rowRe.test(u.body) && /\[RUN\]/.test(u.body),
      );
      return runFrames.length >= 3;
    });

    await p;

    const ups = updates();
    expect(ups.length).toBeGreaterThan(0);
    const last = ups[ups.length - 1].body;

    // Final persisted frame ends with newline.
    expect(last.endsWith('\n')).toBe(true);

    // Extract the last 3 RUN frames for this row; they must contain the hint.
    const lastThreeRun = ups
      .filter((u) => rowRe.test(u.body) && /\[RUN\]/.test(u.body))
      .slice(-3);
    expect(lastThreeRun.length).toBe(3);
    expect(
      lastThreeRun.every((f) =>
        /Press q to cancel,\s*r to restart/i.test(f.body),
      ),
    ).toBe(true);
  });

  it('styled (ANSI): final frame ends with \\n; hint visible (ANSI stripped)', async () => {
    // Styled mode: no BORING; still TTY.
    delete process.env.STAN_BORING;

    const cfg: ContextConfig = {
      stanPath: 'stan',
      scripts: {
        [HOLD]: 'node -e "setTimeout(()=>{}, 1200)"',
      },
    };

    const p = runSelected(dir, cfg, [HOLD], 'concurrent', {
      archive: false,
      live: true,
    });
    // Wait for at least one RUN frame, then completion.
    const rowRe = new RegExp(`(?:^|\\n)script\\s+${HOLD}\\s+`);
    await waitUntil(() => updates().some((u) => rowRe.test(u.body)));
    await p;

    const ups = updates();
    expect(ups.length).toBeGreaterThan(0);
    const last = ups[ups.length - 1].body;
    // Final persisted frame ends with newline.
    expect(last.endsWith('\n')).toBe(true);
    // Hint visible after stripping ANSI.
    const plain = stripAnsi(last);
    expect(/Press q to cancel,\s*r to restart/i.test(plain)).toBe(true);
  });
});
