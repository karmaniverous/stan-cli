import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerConfig } from '@/runner/run';
import { runSelected } from '@/runner/run';
import { rmDirWithRetries } from '@/test/helpers';

// Lightweight tar mock
vi.mock('tar', () => ({
  __esModule: true,
  default: undefined,
  create: async ({ file }: { file: string }) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'TAR', 'utf8');
  },
}));

describe('cancel parity: no-live mode responds to SIGINT (no archives; non-zero exit)', () => {
  let dir: string;
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const exitBackup = process.exitCode;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-cancel-parity-'));
    try {
      // Ensure non-TTY; no-live mode is enforced by behavior.live=false anyway.
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = false;
    } catch {
      // ignore
    }
  });

  afterEach(async () => {
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = ttyBackup;
    } catch {
      // ignore
    }
    // Leave the temp dir before removal (Windows EBUSY mitigation)
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    process.exitCode = exitBackup ?? 0;
    // Pause stdin and allow a brief settle so handles release before rm()
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 100));
    await rmDirWithRetries(dir);
    vi.restoreAllMocks();
  });
  it('sequential scheduling stops and archives are skipped after SIGINT', async () => {
    const cfg: RunnerConfig = {
      stanPath: 'stan',
      scripts: {
        quick: 'node -e "process.stdout.write(`ok`)"',
        wait: 'node -e "setTimeout(()=>{}, 10000)"',
        after: 'node -e "process.stdout.write(`after`)"',
      },
    };
    // Run sequentially so we can assert that 'after' never runs.
    const run = runSelected(
      dir,
      cfg,
      ['quick', 'wait', 'after'],
      'sequential',
      {
        archive: true,
        live: false,
        hangKillGrace: 1,
      },
    );
    // Give the run a moment to start and reach 'wait'
    await new Promise((r) => setTimeout(r, 250));
    process.emit('SIGINT');
    await run;

    const outDir = path.join(dir, 'stan', 'output');
    const quickOut = path.join(outDir, 'quick.txt');
    const afterOut = path.join(outDir, 'after.txt');
    const archiveTar = path.join(outDir, 'archive.tar');
    const diffTar = path.join(outDir, 'archive.diff.tar');

    // 'quick' should have completed; 'after' must not have started
    expect(existsSync(quickOut)).toBe(true);
    expect(existsSync(afterOut)).toBe(false);

    // Archives skipped on cancellation
    expect(existsSync(archiveTar)).toBe(false);
    expect(existsSync(diffTar)).toBe(false);

    // Non-zero exit code
    expect((process.exitCode ?? 0) !== 0).toBe(true);
  });
});
