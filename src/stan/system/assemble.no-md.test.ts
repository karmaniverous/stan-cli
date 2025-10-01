import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleSystemMonolith } from '@/stan/system/assemble';

describe('assembleSystemMonolith skips when parts contains no .md files', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-assemble-'));
  });

  afterEach(async () => {
    // leave temp dir before removal (Windows safety)
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('action is "skipped-no-md" and target path is stable', async () => {
    const parts = path.join(dir, '.stan', 'system', 'parts');
    await mkdir(parts, { recursive: true });
    // Populate with a non-markdown file to exercise the no-md branch
    await writeFile(path.join(parts, 'note.txt'), 'x', 'utf8');

    const res = await assembleSystemMonolith(dir, '.stan');
    expect(res.action).toBe('skipped-no-md');
    expect(
      res.target.endsWith(path.join('.stan', 'system', 'stan.system.md')),
    ).toBe(true);
  });
});
