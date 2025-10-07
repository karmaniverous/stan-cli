import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __clearTarCalls, __tarCalls, type TarCall } from '@/test/mock-tar';

import { runSelected } from './run';

describe('combine archiving behavior (outputs inside archives)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-combine-'));
    __clearTarCalls();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('createArchiveDiff (combine): excludes diff dir and both archive files under outputPath', async () => {
    const out = 'out';

    // Make output tree with files that should and should not be included
    // Ensure parent directories exist (writeFile does not create them).
    await mkdir(path.join(dir, out), { recursive: true });
    await mkdir(path.join(dir, out, 'diff'), { recursive: true });
    await mkdir(path.join(dir, out, 'output'), { recursive: true });

    await writeFile(path.join(dir, out, 'hello.txt'), 'hello', 'utf8');
    await writeFile(path.join(dir, out, 'diff', 'snap.json'), '{}', 'utf8');
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

    const { createArchiveDiff } = await import('@karmaniverous/stan-core');

    await createArchiveDiff({
      cwd: dir,
      stanPath: out,
      baseName: 'archive',
      includeOutputDirInDiff: true,
      updateSnapshot: 'replace',
    });

    const calls = __tarCalls();
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
    // Ensure parent directory before writing
    await mkdir(path.join(dir, out), { recursive: true });

    await writeFile(path.join(dir, out, 'file.txt'), 'x', 'utf8');

    const { createArchive } = await import('@karmaniverous/stan-core');

    await createArchive(dir, out, { includeOutputDir: true });

    const calls = __tarCalls();
    const regCall = calls.find((c) => c.file.endsWith('archive.tar'));
    expect(regCall).toBeTruthy();
    // createArchive provides a flat file list (no filter); ensure at least one outputPath file is included
    expect(regCall?.files.some((p) => p.startsWith(`${out}/`))).toBe(true);
  });
});
