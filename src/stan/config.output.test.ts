import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureOutputDir } from '@/stan/config';

describe('ensureOutputDir (copy/archive.prev + keep semantics)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-ensure-out-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('copies output/archive.tar to diff/archive.prev.tar and clears output when keep=false', async () => {
    const stan = 'stan';
    const outAbs = path.join(dir, stan, 'output');
    await mkdir(outAbs, { recursive: true });
    const body = 'TAR';
    await writeFile(path.join(outAbs, 'archive.tar'), body, 'utf8');

    await ensureOutputDir(dir, stan, false);

    const prevAbs = path.join(dir, stan, 'diff', 'archive.prev.tar');
    const prevBody = await readFile(prevAbs, 'utf8');
    expect(prevBody).toBe(body);

    const entries = await readdir(outAbs);
    expect(entries.length).toBe(0);
  });

  it('does not copy or clear when keep=true', async () => {
    const stan = 'stan';
    const outAbs = path.join(dir, stan, 'output');
    await mkdir(outAbs, { recursive: true });
    await writeFile(path.join(outAbs, 'archive.tar'), 'X', 'utf8');

    await ensureOutputDir(dir, stan, true);

    const prevAbs = path.join(dir, stan, 'diff', 'archive.prev.tar');
    let prevExists = true;
    try {
      await readFile(prevAbs, 'utf8');
    } catch {
      prevExists = false;
    }
    expect(prevExists).toBe(false);

    const entries = await readdir(outAbs);
    expect(entries).toEqual(expect.arrayContaining(['archive.tar']));
  });
});
