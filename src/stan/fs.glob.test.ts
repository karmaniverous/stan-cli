import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { filterFiles, listFiles } from './fs';
describe('filterFiles with glob patterns', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await (
      await import('node:fs/promises')
    ).mkdtemp(path.join(os.tmpdir(), 'stan-fs-glob-'));
    // Make a small tree
    await mkdir(path.join(dir, 'packages', 'app1', '.tsbuild'), {
      recursive: true,
    });
    await mkdir(path.join(dir, 'packages', 'app1', 'src'), { recursive: true });
    await mkdir(path.join(dir, 'services', 'svcA', 'generated'), {
      recursive: true,
    });
    await writeFile(
      path.join(dir, 'packages', 'app1', '.tsbuild', 'state.bin'),
      'x',
      'utf8',
    );
    await writeFile(
      path.join(dir, 'packages', 'app1', 'src', 'index.ts'),
      'ts',
      'utf8',
    );
    await writeFile(
      path.join(dir, 'services', 'svcA', 'generated', 'openapi.ts'),
      '//gen',
      'utf8',
    );
    await writeFile(path.join(dir, 'README.md'), '# readme', 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('excludes **/.tsbuild/** and **/generated/** via excludes globs', async () => {
    const all = await listFiles(dir);
    const filtered = await filterFiles(all, {
      cwd: dir,
      stanPath: 'stan',
      includeOutputDir: false,
      excludes: ['**/.tsbuild/**', '**/generated/**'],
    });

    const hasTsbuild = filtered.some((f) => f.includes('/.tsbuild/'));
    const hasGenerated = filtered.some((f) => f.includes('/generated/'));
    expect(hasTsbuild).toBe(false);
    expect(hasGenerated).toBe(false);

    // Sanity check: keep src and README.md
    expect(filtered).toEqual(
      expect.arrayContaining(['packages/app1/src/index.ts', 'README.md']),
    );
  });

  it('includes globs AUGMENT the base selection (e.g., bring back gitignored files)', async () => {
    const all = await listFiles(dir);
    // Simulate a .gitignore that would exclude README.md
    await writeFile(path.join(dir, '.gitignore'), 'README.md\n', 'utf8');
    const filtered = await filterFiles(all, {
      cwd: dir,
      stanPath: 'stan',
      includeOutputDir: false,
      includes: ['**/*.md'],
    });
    // README.md should be present even though .gitignore would exclude it,
    // and base selection (non-ignored files) should remain included as well.
    expect(filtered).toEqual(
      expect.arrayContaining(['README.md', 'packages/app1/src/index.ts']),
    );
  });

  it('excludes override includes and includes override .gitignore', async () => {
    const all = await listFiles(dir);
    // Simulate a .gitignore that would exclude README.md
    await writeFile(path.join(dir, '.gitignore'), 'README.md\n', 'utf8');
    // With includes only, README.md would be brought back
    const withIncludes = await filterFiles(all, {
      cwd: dir,
      stanPath: 'stan',
      includeOutputDir: false,
      includes: ['**/*.md'],
    });
    expect(withIncludes).toEqual(
      expect.arrayContaining(['README.md', 'packages/app1/src/index.ts']),
    );
    // But when explicitly excluded, excludes win over includes
    const withExcludes = await filterFiles(all, {
      cwd: dir,
      stanPath: 'stan',
      includeOutputDir: false,
      includes: ['**/*.md'],
      excludes: ['README.md'],
    });
    expect(withExcludes).not.toEqual(expect.arrayContaining(['README.md']));
  });
});
