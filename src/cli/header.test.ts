import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stripAnsi } from '@/runner/run/live/format';

import { printHeader } from './header';

describe('printHeader (BORING/TTY)', () => {
  const envBackup = { ...process.env };
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  // Structural spy type to avoid TS constructor-signature friction in vitest typings
  let logSpy: {
    mockRestore: () => void;
    mock: { calls: unknown[][] };
  };

  beforeEach(() => {
    process.env = { ...envBackup };
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
    } catch {
      /* ignore */
    }
    logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => {}) as unknown as {
      mockRestore: () => void;
      mock: { calls: unknown[][] };
    };
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.env = { ...envBackup };
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = ttyBackup;
    } catch {
      /* ignore */
    }
  });

  it('prints plain token in BORING mode', () => {
    process.env.STAN_BORING = '1';
    printHeader('run', 'snap');
    const out = (logSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(out).toContain('stan: run (last command: snap)');
  });

  it('prints styled token in TTY (arrow present after stripping ANSI)', () => {
    delete process.env.STAN_BORING;
    // Ensure color/styling is allowed
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
    } catch {
      /* ignore */
    }
    printHeader('run', 'snap');
    // Safely collect console args without triggering base-to-string lint
    const firstCall = logSpy.mock.calls[0] ?? [];
    const rawJoined = firstCall
      .map((v) =>
        typeof v === 'string'
          ? v
          : v instanceof Error
            ? v.message
            : typeof v === 'number' || typeof v === 'boolean'
              ? String(v)
              : '',
      )
      .join(' ');
    const plain = stripAnsi(rawJoined);
    expect(plain).toContain('▶︎ run');
    expect(plain).toContain('(last command: snap)');
  });
});
