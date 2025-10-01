import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContextConfig } from '@/stan/config';
import { runSelected } from '@/stan/run';

// Keep tar lightweight
vi.mock('tar', () => ({
  __esModule: true,
  default: undefined,
  create: async ({ file }: { file: string }) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'TAR', 'utf8');
  },
}));

describe('sequential gate: do not schedule next script after SIGINT boundary', () => {
  let dir: string;
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const exitBackup = process.exitCode;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-cancel-gate-'));
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = false;
    } catch {
      // ignore
    }
    // small scripts
    await writeFile(path.join(dir, 'a.js'), 'setTimeout(()=>{}, 150)', 'utf8');
    await writeFile(
      path.join(dir, 'b.js'),
      'process.stdout.write("b")',
      'utf8',
    );
  });

  afterEach(async () => {
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = ttyBackup;
    } catch {
      // ignore
    }
    process.exitCode = exitBackup ?? 0;
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
    await new Promise((r) => setTimeout(r, 50));
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('emits SIGINT after first completes; second must not run', async () => {
    const cfg: ContextConfig = {
      stanPath: 'stan',
      scripts: {
        a: 'node a.js',
        b: 'node b.js',
      },
    };
    const p = runSelected(dir, cfg, ['a', 'b'], 'sequential', {
      archive: true,
      live: false,
      hangKillGrace: 1,
    });
    // Emit SIGINT shortly after starting; gate should prevent 'b'
    await new Promise((r) => setTimeout(r, 160));
    process.emit('SIGINT');
    await p;
    const outDir = path.join(dir, 'stan', 'output');
    expect(existsSync(path.join(outDir, 'a.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'b.txt'))).toBe(false);
  });
});
