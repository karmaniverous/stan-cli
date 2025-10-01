import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContextConfig } from '@/stan/config';
import { runSelected } from '@/stan/run';

// Lightweight tar mock to keep runs deterministic
vi.mock('tar', () => ({
  __esModule: true,
  default: undefined,
  create: async ({ file }: { file: string }) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'TAR', 'utf8');
  },
}));

const readUtf8 = (p: string) => readFile(p, 'utf8');

describe('UI parity (live vs no-live): artifacts are identical', () => {
  let dir1: string;
  let dir2: string;
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const envBackup = { ...process.env };

  beforeEach(async () => {
    dir1 = await mkdtemp(path.join(os.tmpdir(), 'stan-ui-parity-1-'));
    dir2 = await mkdtemp(path.join(os.tmpdir(), 'stan-ui-parity-2-'));
    process.env = { ...envBackup, STAN_BORING: '1' }; // stable labels
  });

  afterEach(async () => {
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = ttyBackup;
    } catch {
      // ignore
    }
    process.env = { ...envBackup };
    await rm(dir1, { recursive: true, force: true });
    await rm(dir2, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const writeHello = async (root: string) => {
    await writeFile(
      path.join(root, 'hello.js'),
      'process.stdout.write("Hello")',
      'utf8',
    );
  };

  it('produces the same outputs and archive decisions', async () => {
    const cfg: ContextConfig = {
      stanPath: 'stan',
      scripts: { hello: 'node hello.js' },
    };

    // no-live
    await writeHello(dir1);
    const created1 = await runSelected(dir1, cfg, ['hello'], 'concurrent', {
      archive: true,
      live: false,
    });
    const out1 = path.join(dir1, 'stan', 'output');
    const hello1 = await readUtf8(path.join(out1, 'hello.txt'));
    const hasArch1 =
      existsSync(path.join(out1, 'archive.tar')) &&
      existsSync(path.join(out1, 'archive.diff.tar'));

    // live (TTY)
    await writeHello(dir2);
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
    } catch {
      // best-effort
    }
    const created2 = await runSelected(dir2, cfg, ['hello'], 'concurrent', {
      archive: true,
      live: true,
    });
    const out2 = path.join(dir2, 'stan', 'output');
    const hello2 = await readUtf8(path.join(out2, 'hello.txt'));
    const hasArch2 =
      existsSync(path.join(out2, 'archive.tar')) &&
      existsSync(path.join(out2, 'archive.diff.tar'));

    // Parity assertions
    expect(hello1).toBe(hello2);
    expect(hasArch1).toBe(true);
    expect(hasArch2).toBe(true);

    // Sanity: both returned paths include archives
    expect(created1.some((p) => p.endsWith('archive.tar'))).toBe(true);
    expect(created1.some((p) => p.endsWith('archive.diff.tar'))).toBe(true);
    expect(created2.some((p) => p.endsWith('archive.tar'))).toBe(true);
    expect(created2.some((p) => p.endsWith('archive.diff.tar'))).toBe(true);
  });
});
