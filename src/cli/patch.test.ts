import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rmDirWithRetries } from '@/test';

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
    await rmDirWithRetries(dir);
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
    // Single “patch source” line (no duplicates)
    expect(
      logs.filter((l) => /stan:\s+patch source:\s+clipboard/i.test(l)).length,
    ).toBe(1);
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
    // Single “patch source” line (no duplicates)
    expect(
      logs.filter((l) => /stan:\s+patch source:\s+file\s+"my\.patch"/i.test(l))
        .length,
    ).toBe(1);
    expect(hasTerminalStatus(logs)).toBe(true);

    logSpy.mockRestore();
  });

  it('reads from argument, logs single source line, and emits terminal status', async () => {
    const cli = new Command();
    registerPatch(cli);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Minimal invalid diff (ensures failure path without external side effects)
    const diff = [
      'diff --git a/src/x.ts b/src/x.ts',
      '--- a/src/x.ts',
      '+++ b/src/x.ts',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    await cli.parseAsync(['node', 'stan', 'patch', diff], { from: 'user' });
    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    // Single source line for argument
    expect(
      logs.filter((l) => /stan:\s+patch source:\s+argument/i.test(l)).length,
    ).toBe(1);
    expect(hasTerminalStatus(logs)).toBe(true);
    logSpy.mockRestore();
  });

  it('failure message includes tail "-> <path>" (apply path)', async () => {
    const cli = new Command();
    registerPatch(cli);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
      '',
    ].join('\n');
    await cli.parseAsync(['node', 'stan', 'patch', diff], { from: 'user' });
    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    // Expect tail arrow with target path on failure
    expect(
      logs.some((l) =>
        /stan:\s+(?:✖|\[FAIL\])\s+patch\s+failed\s+->\s+src\/foo\.ts/i.test(l),
      ),
    ).toBe(true);
    logSpy.mockRestore();
  });

  it('failure message includes tail "-> <path>" (check path)', async () => {
    const cli = new Command();
    registerPatch(cli);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const diff = [
      'diff --git a/src/bar.ts b/src/bar.ts',
      '--- a/src/bar.ts',
      '+++ b/src/bar.ts',
      '@@ -1,1 +1,1 @@',
      '-c',
      '+d',
      '',
    ].join('\n');
    await cli.parseAsync(['node', 'stan', 'patch', '--check', diff], {
      from: 'user',
    });
    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    // Expect tail arrow with target path on failure (check mode)
    expect(
      logs.some((l) =>
        /stan:\s+(?:✖|\[FAIL\])\s+patch\s+check\s+failed\s+->\s+src\/bar\.ts/i.test(
          l,
        ),
      ),
    ).toBe(true);
    logSpy.mockRestore();
  });
});
