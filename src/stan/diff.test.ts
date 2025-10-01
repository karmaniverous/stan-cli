import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock tar.create to just write a recognizable body for any target file path.
vi.mock('tar', () => ({
  default: undefined,
  create: async ({ file }: { file: string }) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'DUMMY_TAR_CONTENT\n', 'utf8');
  },
}));

import { runSelected } from './run';

describe('diff mode (updated behavior)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-diff-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('creates archive.diff.tar whenever --archive is enabled', async () => {
    const cfg = {
      stanPath: 'out',
      scripts: {
        test: 'node -e "console.error(123);process.stdout.write(`ok`)"',
      },
    } as const;

    const created = await runSelected(dir, cfg, ['test'], 'concurrent', {
      archive: true,
    });
    const diffPath = created.find((p) => p.endsWith('archive.diff.tar'));
    expect(diffPath).toBeTruthy();
  });

  it('with --archive and --combine: writes regular+diff archives including outputs', async () => {
    const cfg = {
      stanPath: 'out',
      scripts: {
        test: 'node -e "console.error(123);process.stdout.write(`ok`)"',
      },
    } as const;
    const created = await runSelected(dir, cfg, ['test'], 'concurrent', {
      archive: true,
      combine: true,
    });
    expect(created.some((p) => p.endsWith('archive.tar'))).toBe(true);
    const diffPath = created.find((p) => p.endsWith('archive.diff.tar'));
    expect(diffPath).toBeTruthy();
  });
});
