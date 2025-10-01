import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContextConfig } from '@/stan/config';
import { runSelected } from '@/stan/run';
// Windows teardown helper
import { rmDirWithRetries } from '@/test/helpers';
// Lightweight tar
vi.mock('tar', () => ({
  __esModule: true,
  default: undefined,
  create: async ({ file }: { file: string }) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'TAR', 'utf8');
  },
}));

describe('TTY key handler (q) cancels run', () => {
  let dir: string;
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const exitBackup = process.exitCode;
  // Provide minimal TTY-like stdin surface
  const stdinLike = process.stdin as unknown as NodeJS.ReadStream & {
    isTTY?: boolean;
    setRawMode?: (v: boolean) => void;
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-cancel-key-'));
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
    } catch {
      // ignore
    }
    // TTY-like stdin with raw mode
    stdinLike.isTTY = true;
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
  it('pressing q cancels and skips archive', async () => {
    const cfg: ContextConfig = {
      stanPath: 'stan',
      scripts: {
        wait: 'node -e "setTimeout(()=>{}, 10000)"',
      },
    };
    const run = runSelected(dir, cfg, ['wait'], 'concurrent', {
      archive: true,
      live: true,
      hangKillGrace: 1,
    });
    await new Promise((r) => setTimeout(r, 200));
    // Simulate 'q' keypress
    (
      process.stdin as unknown as { emit: (ev: string, d?: unknown) => void }
    ).emit('data', 'q');
    await run;

    const outDir = path.join(dir, 'stan', 'output');
    const archiveTar = path.join(outDir, 'archive.tar');
    const diffTar = path.join(outDir, 'archive.diff.tar');
    expect(existsSync(archiveTar)).toBe(false);
    expect(existsSync(diffTar)).toBe(false);
    expect((process.exitCode ?? 0) !== 0).toBe(true);
  });
});
