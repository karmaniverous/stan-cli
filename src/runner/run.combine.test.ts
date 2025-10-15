import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerConfig } from '@/runner/run';

import { runSelected } from './run';

// Ensure tar writing is mocked to avoid heavy operations
vi.mock('tar', () => ({
  default: undefined,
  create: async ({ file }: { file: string }) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'DUMMY_TAR\n', 'utf8');
  },
}));

describe('runSelected archive/combine/keep behavior', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-run-combine-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('sequential mode: scripts run then archive created with --archive', async () => {
    await writeFile(
      path.join(dir, 'a.js'),
      'process.stdout.write("A")',
      'utf8',
    );
    await writeFile(
      path.join(dir, 'b.js'),
      'process.stdout.write("B")',
      'utf8',
    );

    const cfg: RunnerConfig = {
      stanPath: 'stan',
      scripts: { a: 'node a.js', b: 'node b.js' },
    };
    const created = await runSelected(dir, cfg, null, 'sequential', {
      archive: true,
    });
    expect(
      created.includes(path.join(dir, 'stan', 'output', 'archive.tar')),
    ).toBe(true);
  });

  it('--archive + --combine: outputs go inside archives and are removed on disk', async () => {
    await writeFile(
      path.join(dir, 'hello.js'),
      'process.stdout.write("Hello")',
      'utf8',
    );
    const cfg: RunnerConfig = {
      stanPath: 'stan',
      scripts: { hello: 'node hello.js' },
    };
    const created = await runSelected(dir, cfg, ['hello'], 'concurrent', {
      archive: true,
      combine: true,
    });
    // archives present
    expect(created.some((p) => p.endsWith('archive.tar'))).toBe(true);
    expect(created.some((p) => p.endsWith('archive.diff.tar'))).toBe(true);
    // on-disk outputs removed
    expect(existsSync(path.join(dir, 'stan', 'output', 'hello.txt'))).toBe(
      false,
    );
  });

  it('--archive without --combine: outputs remain on disk and archives exist', async () => {
    await writeFile(
      path.join(dir, 'x.js'),
      'process.stdout.write("X")',
      'utf8',
    );
    const cfg: RunnerConfig = {
      stanPath: 'stan',
      scripts: { x: 'node x.js' },
    };
    const created = await runSelected(dir, cfg, ['x'], 'concurrent', {
      archive: true,
    });
    expect(created.some((p) => p.endsWith('archive.tar'))).toBe(true);
    expect(created.some((p) => p.endsWith('archive.diff.tar'))).toBe(true);
    // on-disk output remains
    expect(existsSync(path.join(dir, 'stan', 'output', 'x.txt'))).toBe(true);
  });
});
