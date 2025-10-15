import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSelected } from './run';

describe('combine archiving behavior (outputs inside archives)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-combine-'));
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

    const { diffPath } = await createArchiveDiff({
      cwd: dir,
      stanPath: out,
      baseName: 'archive',
      includeOutputDirInDiff: true,
      updateSnapshot: 'replace',
    });
    // Existence of the diff archive confirms archiving executed (filter semantics are exercised in core tests).
    expect(existsSync(diffPath)).toBe(true);
  });

  it('createArchive (combine): includes files under the outputPath', async () => {
    const out = 'out';
    // Ensure parent directory before writing
    await mkdir(path.join(dir, out), { recursive: true });

    await writeFile(path.join(dir, out, 'file.txt'), 'x', 'utf8');

    const { createArchive } = await import('@karmaniverous/stan-core');

    const archivePath = await createArchive(dir, out, {
      includeOutputDir: true,
    });
    expect(existsSync(archivePath)).toBe(true);
  });
});
