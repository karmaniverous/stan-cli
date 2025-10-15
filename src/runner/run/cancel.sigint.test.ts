import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerConfig } from '@/runner/run';
import { runSelected } from '@/runner/run';
// Windows teardown helper
import { rmDirWithRetries } from '@/test/helpers';

// Make tar lightweight
vi.mock('tar', () => ({
  __esModule: true,
  default: undefined,
  create: async ({ file }: { file: string }) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'TAR', 'utf8');
  },
}));

describe('SIGINT cancellation skips archive and restores state', () => {
  let dir: string;
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const exitBackup = process.exitCode;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-cancel-sigint-'));
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
  it('emits SIGINT to cancel run and does not create archives', async () => {
    const cfg: RunnerConfig = {
      stanPath: 'stan',
      scripts: {
        // Busy-wait a bit so we can signal during execution
        wait: 'node -e "setTimeout(()=>{}, 10000)"',
      },
    };
    const run = runSelected(dir, cfg, ['wait'], 'concurrent', {
      archive: true,
      live: true,
      hangKillGrace: 1,
    });
    // Give the child a moment to spawn
    await new Promise((r) => setTimeout(r, 200));
    process.emit('SIGINT'); // parity path
    await run;

    const outDir = path.join(dir, 'stan', 'output');
    const archiveTar = path.join(outDir, 'archive.tar');
    const diffTar = path.join(outDir, 'archive.diff.tar');
    expect(existsSync(archiveTar)).toBe(false);
    expect(existsSync(diffTar)).toBe(false);
    // Service sets a non-zero exit code on cancel (best-effort)
    expect((process.exitCode ?? 0) !== 0).toBe(true);
  });
});
