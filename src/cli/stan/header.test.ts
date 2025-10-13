import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stripAnsi } from '@/stan/run/live/format';

import { printHeader } from './header';

describe('printHeader (BORING/TTY)', () => {
  const envBackup = { ...process.env };
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = { ...envBackup };
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
    } catch {
      /* ignore */
    }
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
    } catch {
      /* ignore */
    }
    printHeader('run', 'snap');
    const raw = String(logSpy.mock.calls[0]?.[0] ?? '');
    const plain = stripAnsi(raw);
    expect(plain).toContain('▶︎ run');
    expect(plain).toContain('(last command: snap)');
  });
});
