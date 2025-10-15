import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock spawn to avoid running real git; return an EE that closes with code 0.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    __esModule: true,
    ...actual,
    default: actual as unknown as object,
    spawn: () => {
      const ee = new EventEmitter();
      setTimeout(() => ee.emit('close', 0), 0);
      return ee as unknown;
    },
  };
});

// Mock clipboardy for clipboard tests
vi.mock('clipboardy', () => ({
  __esModule: true,
  default: {
    read: () => Promise.resolve('Zm9v'), // "foo" base64; no await in body
  },
}));

import { registerPatch } from '@/cli/patch';

const hasTerminalStatus = (logs: string[]): boolean =>
  logs.some((l) =>
    /(?:^|\s)(?:✔|\[OK\]|✖|\[FAIL\])\s+patch\s+(applied|failed|check passed|check failed)/i.test(
      l,
    ),
  );

describe('patch subcommand (clipboard and file modes)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-patch-'));
    process.chdir(dir);
  });

  afterEach(async () => {
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    // Mitigate transient Windows EBUSY/ENOTEMPTY during teardown:
    // - Pause stdin (avoids lingering raw-mode handles in some environments)
    // - Allow a brief settle before removing the temp directory
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      // ignore
    }
    await delay(10);
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  it('reads from clipboard by default and logs terminal status', async () => {
    const cli = new Command();
    registerPatch(cli);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // No args => clipboard mode
    await cli.parseAsync(['node', 'stan', 'patch'], { from: 'user' });

    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    expect(logs.some((l) => /stan:\s+patch source:\s+clipboard/i.test(l))).toBe(
      true,
    );
    // Terminal status: applied | failed | check passed | check failed
    expect(hasTerminalStatus(logs)).toBe(true);

    logSpy.mockRestore();
  });

  it('reads from file with -f and logs terminal status', async () => {
    const cli = new Command();
    registerPatch(cli);

    // Create a file patch (content body not validated; apply is mocked)
    const rel = 'my.patch';
    await writeFile(path.join(dir, rel), 'diff --git a/x b/x\n', 'utf8');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cli.parseAsync(['node', 'stan', 'patch', '-f', rel], {
      from: 'user',
    });

    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    expect(
      logs.some((l) => /stan:\s+patch source:\s+file\s+"my\.patch"/i.test(l)),
    ).toBe(true);
    expect(hasTerminalStatus(logs)).toBe(true);

    logSpy.mockRestore();
  });
});
