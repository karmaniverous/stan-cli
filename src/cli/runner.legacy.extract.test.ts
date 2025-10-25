import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeCli } from '@/cli/index';

describe('legacy engine config extraction (transitional) emits debugFallback under STAN_DEBUG=1', () => {
  let dir: string;
  const envBackup = { ...process.env };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-legacy-extract-'));
    try {
      process.chdir(dir);
    } catch {
      // ignore
    }
    process.env = { ...envBackup, STAN_DEBUG: '1' };
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('falls back to legacy root keys when stan-core is missing', async () => {
    // Legacy-only engine keys at root (no "stan-core")
    const yml = [
      'stanPath: stan',
      'includes: []',
      'excludes: []',
      'scripts:',
      '  a: echo a',
    ].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');

    const cli = makeCli();

    const logs: string[] = [];
    const errs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });
    const errSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((m: unknown) => {
        errs.push(String(m));
      });

    await cli.parseAsync(['node', 'stan', 'run', '-p'], { from: 'user' });

    logSpy.mockRestore();
    errSpy.mockRestore();

    expect(errs.join('\n')).toMatch(
      /stan:\s+debug:\s+fallback:\s+run\.action:engine-legacy/i,
    );
    expect(logs.join('\n')).toMatch(/STAN run plan/i);
  });
});
