import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContextConfig } from '@/stan/config';
import { runSelected } from '@/stan/run';
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

describe('cancellation pipeline (scheduler)', () => {
  let dir: string;
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const exitBackup = process.exitCode;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-cancel-sched-'));
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
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
    process.exitCode = exitBackup ?? 0;
    // Leave the temp dir before removal and release handles (Windows EBUSY mitigation)
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 100));
    await rmDirWithRetries(dir);
    vi.restoreAllMocks();
  });
  it('stops scheduling new scripts after cancellation in sequential mode', async () => {
    const cfg: ContextConfig = {
      stanPath: 'stan',
      scripts: {
        wait: 'node -e "setTimeout(()=>{}, 10000)"', // long-running
        after: 'node -e "process.stdout.write(`after`)"', // should not run
      },
    };

    const run = runSelected(dir, cfg, ['wait', 'after'], 'sequential', {
      archive: true,
      live: true,
      hangKillGrace: 1,
    });

    // Wait for 'wait' to start, then cancel
    await new Promise((r) => setTimeout(r, 200));
    process.emit('SIGINT');
    await run;

    const outDir = path.join(dir, 'stan', 'output');
    const waitOut = path.join(outDir, 'wait.txt');
    const afterOut = path.join(outDir, 'after.txt');

    // 'wait' was running, so its output file may have been created
    // 'after' should not have run, so its output file must not exist
    expect(existsSync(afterOut)).toBe(false);

    // Archives should be skipped
    const archiveTar = path.join(outDir, 'archive.tar');
    const diffTar = path.join(outDir, 'archive.diff.tar');
    expect(existsSync(archiveTar)).toBe(false);
    expect(existsSync(diffTar)).toBe(false);

    // Exit code should be non-zero
    expect((process.exitCode ?? 0) !== 0).toBe(true);
  });
});
