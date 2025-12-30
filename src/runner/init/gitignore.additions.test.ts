import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureStanGitignore } from '@/runner/init/gitignore';
import { rmDirWithRetries } from '@/test';

const readUtf8 = (p: string) => readFile(p, 'utf8');

describe('ensureStanGitignore — adds system state/metadata files', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-gitignore-'));
  });

  afterEach(async () => {
    await rmDirWithRetries(dir);
  });

  it('adds standard subpaths and system files (facet.state.json, .docs.meta.json)', async () => {
    const giPath = path.join(dir, '.gitignore');
    // seed with unrelated content
    await writeFile(giPath, 'node_modules/\n', 'utf8');

    await ensureStanGitignore(dir, 'out');

    const body = await readUtf8(giPath);
    const lines = body.split(/\r?\n/).map((l) => l.trim());
    expect(lines).toEqual(
      expect.arrayContaining([
        'node_modules/',
        'out/output/',
        'out/diff/',
        'out/dist/',
        'out/patch/',
        'out/imports/',
        'out/system/facet.state.json',
        'out/system/.docs.meta.json',
      ]),
    );
  });

  it('is idempotent (does not duplicate lines on a subsequent run)', async () => {
    const giPath = path.join(dir, '.gitignore');
    await writeFile(giPath, '', 'utf8');

    await ensureStanGitignore(dir, 'stan');
    const first = await readUtf8(giPath);

    await ensureStanGitignore(dir, 'stan');
    const second = await readUtf8(giPath);

    expect(second).toBe(first);
  });
});
