import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock only executeFileOps; preserve real implementations for other exports
vi.mock('@karmaniverous/stan-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@karmaniverous/stan-core')>();
  return {
    __esModule: true,
    ...actual,
    executeFileOps: async () => ({ ok: true, results: [] }),
  };
});

import { registerPatch } from '@/cli/patch';

describe('patch classification — File Ops only', () => {
  let dir: string;
  const envBackup = { ...process.env };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-patch-fo-'));
    try {
      process.chdir(dir);
    } catch {
      // ignore
    }
    process.env = { ...envBackup, STAN_BORING: '1' }; // stable [OK]/[FAIL] tokens
    // Minimal config so header resolution (last command) and defaults do not fail
    await writeFile(
      path.join(dir, 'stan.config.yml'),
      ['stanPath: .stan', 'scripts: {}'].join('\n'),
      'utf8',
    );
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    try {
      process.chdir(tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('accepts File Ops–only payload (no false file-ops+diff classification)', async () => {
    const foOnly = [
      '### File Ops',
      'rm src/stan/run/ui/index.ts',
      'rm src/stan/run/ui/live-ui.ts',
      'rm src/stan/run/ui/logger-ui.ts',
      'rm src/stan/run/ui/types.ts',
    ].join('\n');

    const cli = new Command();
    registerPatch(cli);

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });

    await cli.parseAsync(['node', 'stan', 'patch', foOnly], { from: 'user' });
    spy.mockRestore();

    const body = logs.join('\n');
    // Success message for FO-only path
    expect(body).toMatch(/stan:\s+\[OK\]\s+file ops applied/i);
    // Ensure we did not misclassify as "file-ops+diff (invalid)"
    expect(body).not.toMatch(/file-ops\+diff/i);
  });
});
