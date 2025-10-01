import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { filterFiles, listFiles } from './fs';

describe('default sub‑package exclusion and re‑include via includes', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await (
      await import('node:fs/promises')
    ).mkdtemp(path.join(os.tmpdir(), 'stan-fs-subpkg-'));

    // Nested sub‑package: packages/app1 with its own package.json
    await mkdir(path.join(dir, 'packages', 'app1', 'src'), { recursive: true });
    await writeFile(
      path.join(dir, 'packages', 'app1', 'package.json'),
      JSON.stringify({ name: 'app1' }),
      'utf8',
    );
    await writeFile(
      path.join(dir, 'packages', 'app1', 'src', 'index.ts'),
      'export const x = 1;\n',
      'utf8',
    );
    // Normal top-level file
    await writeFile(path.join(dir, 'README.md'), '# readme\n', 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('excludes nested sub‑package by default', async () => {
    const all = await listFiles(dir);
    const filtered = await filterFiles(all, {
      cwd: dir,
      stanPath: 'stan',
      includeOutputDir: false,
    });
    // README remains; nested sub‑package files are excluded by default
    expect(filtered).toEqual(expect.arrayContaining(['README.md']));
    expect(filtered.some((f) => f.startsWith('packages/app1/'))).toBe(false);
  });

  it('re‑includes a sub‑package via includes globs', async () => {
    const all = await listFiles(dir);
    const filtered = await filterFiles(all, {
      cwd: dir,
      stanPath: 'stan',
      includeOutputDir: false,
      includes: ['packages/app1/**'],
    });
    expect(filtered).toEqual(
      expect.arrayContaining(['README.md', 'packages/app1/src/index.ts']),
    );
  });
});
