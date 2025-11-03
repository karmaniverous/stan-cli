import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rmDirWithRetries } from '@/test';
// Mock diff.writeArchiveSnapshot in the module actually used by handleSnap
vi.mock('@/runner/diff', () => ({
  __esModule: true,
  writeArchiveSnapshot: async ({
    cwd,
    stanPath,
  }: {
    cwd: string;
    stanPath: string;
  }) => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const p = path.join(cwd, stanPath, 'diff');
    await mkdir(p, { recursive: true });
    await writeFile(
      path.join(p, '.archive.snapshot.json'),
      JSON.stringify({ ok: true, t: Date.now() }, null, 2),
      'utf8',
    );
  },
}));

// Mock runGit in the snap layer to force success for stash and pop
vi.mock('@/runner/snap/git', () => ({
  __esModule: true,
  runGit: () => Promise.resolve({ code: 0, stdout: '', stderr: '' }),
}));

// Dynamic loader to ensure mocks are installed before the CLI registers actions
const loadRegisterSnap = async () => {
  vi.resetModules();
  const mod = await import('@/cli/snap');
  return mod.registerSnap as (cli: Command) => Command;
};

describe('snap CLI (-s) logs stash/pop confirmations on success', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-snap-success-'));
    try {
      process.chdir(dir);
    } catch {
      // ignore
    }
    // Minimal config so snap resolves context and paths
    await writeFile(
      path.join(dir, 'stan.config.yml'),
      ['stanPath: out', 'scripts: {}'].join('\n'),
      'utf8',
    );
  });

  afterEach(async () => {
    try {
      process.chdir(tmpdir());
    } catch {
      // ignore
    }
    // Windows safety: release handles and retry removal to avoid ENOTEMPTY.
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 100));
    await rmDirWithRetries(dir);
    vi.restoreAllMocks();
  });

  it('prints confirmations for stash and pop', async () => {
    const registerSnap = await loadRegisterSnap();
    const cli = new Command();
    registerSnap(cli);
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });
    await cli.parseAsync(['node', 'stan', 'snap', '-s'], { from: 'user' });
    spy.mockRestore();
    expect(logs.some((l) => /stash saved changes/i.test(l))).toBe(true);
    // New: confirmation printed after a successful snapshot.
    expect(logs.some((l) => /snapshot updated/i.test(l))).toBe(true);
    expect(logs.some((l) => /stash pop restored changes/i.test(l))).toBe(true);
  });
});
