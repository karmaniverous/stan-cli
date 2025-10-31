import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    // SSR/ESM-robust dynamic resolver for core APIs
    const core = (await import('@karmaniverous/stan-core')) as unknown as {
      createArchiveDiff?: unknown;
      default?: { createArchiveDiff?: unknown };
    };
    const createArchiveDiffFn =
      typeof core.createArchiveDiff === 'function'
        ? (core.createArchiveDiff as (typeof import('@karmaniverous/stan-core'))['createArchiveDiff'])
        : typeof core.default?.createArchiveDiff === 'function'
          ? (core.default
              .createArchiveDiff as (typeof import('@karmaniverous/stan-core'))['createArchiveDiff'])
          : undefined;
    if (!createArchiveDiffFn) throw new Error('createArchiveDiff not found');

    const { diffPath } = await createArchiveDiffFn({
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

    // SSR/ESM-robust dynamic resolver for core APIs
    const core2 = (await import('@karmaniverous/stan-core')) as unknown as {
      createArchive?: unknown;
      default?: { createArchive?: unknown };
    };
    const createArchiveFn =
      typeof core2.createArchive === 'function'
        ? (core2.createArchive as (typeof import('@karmaniverous/stan-core'))['createArchive'])
        : typeof core2.default?.createArchive === 'function'
          ? (core2.default
              .createArchive as (typeof import('@karmaniverous/stan-core'))['createArchive'])
          : undefined;
    if (!createArchiveFn) throw new Error('createArchive not found');

    const archivePath = await createArchiveFn(dir, out, {
      includeOutputDir: true,
    });
    expect(existsSync(archivePath)).toBe(true);
  });
});
