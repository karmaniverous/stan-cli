import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createArchive, createArchiveDiff } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TarCall = {
  file: string;
  cwd?: string;
  filter?: (p: string, s: unknown) => boolean;
  files: string[];
};

const calls: TarCall[] = [];

// Mock tar.create to capture the file list and filter
vi.mock('tar', () => ({
  default: undefined,
  create: async (
    opts: {
      file: string;
      cwd?: string;
      filter?: (p: string, s: unknown) => boolean;
    },
    files: string[],
  ) => {
    calls.push({ file: opts.file, cwd: opts.cwd, filter: opts.filter, files });
    // Write recognizable content to the "archive"
    const { writeFile } = await import('node:fs/promises');
    await writeFile(opts.file, 'TAR', 'utf8');
  },
}));

describe('combine archiving behavior (outputs inside archives)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-combine-'));
    calls.length = 0;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('createArchiveDiff (combine): excludes diff dir and both archive files under outputPath', async () => {
    const out = 'out';

    // Make output tree with files that should and should not be included
    await mkdir(path.join(dir, out, 'diff'), { recursive: true });
    await mkdir(path.join(dir, out, 'output'), { recursive: true });
    await writeFile(path.join(dir, out, 'hello.txt'), 'hello', 'utf8');
    await writeFile(path.join(dir, out, 'diff', 'snap.json'), '{}', 'utf8');
    // Simulate archives present under the output path
    await writeFile(
      path.join(dir, out, 'output', 'archive.tar'),
      'old',
      'utf8',
    );
    await writeFile(
      path.join(dir, out, 'output', 'archive.diff.tar'),
      'old',
      'utf8',
    );

    await createArchiveDiff({
      cwd: dir,
      stanPath: out,
      baseName: 'archive',
      includeOutputDirInDiff: true,
      updateSnapshot: 'replace',
    });

    const diffCall = calls.find((c) => c.file.endsWith('archive.diff.tar'));
    expect(diffCall).toBeTruthy();
    expect(typeof diffCall?.filter).toBe('function');

    const f = diffCall?.filter as (p: string, s: unknown) => boolean;
    // Exclusions (current layout)
    expect(f(`${out}/diff`, undefined)).toBe(false);
    expect(f(`${out}/diff/snap.json`, undefined)).toBe(false);
    expect(f(`${out}/output/archive.tar`, undefined)).toBe(false);
    expect(f(`${out}/output/archive.diff.tar`, undefined)).toBe(false);
    // Inclusion
    expect(f(`${out}/hello.txt`, undefined)).toBe(true);
  });

  it('createArchive (combine): includes files under the outputPath', async () => {
    const out = 'out';
    await mkdir(path.join(dir, out), { recursive: true });
    await writeFile(path.join(dir, out, 'file.txt'), 'x', 'utf8');

    await createArchive(dir, out, { includeOutputDir: true });

    const regCall = calls.find((c) => c.file.endsWith('archive.tar'));
    expect(regCall).toBeTruthy();
    // createArchive provides a flat file list (no filter); ensure at least one outputPath file is included
    expect(regCall?.files.some((p) => p.startsWith(`${out}/`))).toBe(true);
  });
});
