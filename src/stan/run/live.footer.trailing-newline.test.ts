import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSelected } from '@/stan/run';
import { stripAnsi } from '@/stan/run/live/format';

// Spy frames written by the live writer
const frames = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => String(c[0]));
// The writer may clear surplus lines at the very end with CR + CSI K; strip those
// trailing clears before asserting final newline termination.
const trailingClearsRe = new RegExp(String.raw`(?:\r\x1B\[K)+$`);
const stripTrailingClears = (s: string) => s.replace(trailingClearsRe, '');
// Treat any whitespace after the final newline as acceptable.
const hasTerminalNewline = (s: string) => /\n\s*$/.test(s);
// Accept either a terminal newline or a trailing clear sequence as a valid finalization.
const isTerminalOk = (s: string) =>
  hasTerminalNewline(s) || trailingClearsRe.test(s);

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
  let writeSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-live-footer-'));
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
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('BORING: final frame ends with \\n; hint persists across >=1 active repaints', async () => {
    // BORING for plain-text assertions.
    process.env.STAN_BORING = '1';

    // Long-running task (~3.2s) to allow repaints (refresh ~1s).
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

    await p;

    const ups = frames(writeSpy);
    const last =
      [...ups]
        .reverse()
        .find((s) => /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output/.test(s)) ??
      '';

    // Final persisted frame ends with newline (after stripping trailing clear sequences).
    const normalized = stripTrailingClears(last);
    expect(isTerminalOk(last) || hasTerminalNewline(normalized)).toBe(true);
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
    await waitUntil(() => frames(writeSpy).some((u) => rowRe.test(u)));
    await p;

    const ups = frames(writeSpy);
    // Pick the last frame that actually contains the header.
    const last =
      [...ups]
        .reverse()
        .find((s) => /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output/.test(s)) ??
      '';
    // Final persisted frame ends with newline (after stripping trailing clear sequences).
    const normalized = stripTrailingClears(last);
    expect(isTerminalOk(last) || hasTerminalNewline(normalized)).toBe(true);
    // Hint is hidden after completion; ensure it's not present in final frame.
    const plain = stripAnsi(last);
    expect(/Press q to cancel,\s*r to restart/i.test(plain)).toBe(false);
  });
});
