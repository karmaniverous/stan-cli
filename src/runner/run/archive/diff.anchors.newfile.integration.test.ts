import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createArchiveDiff,
  ensureOutputDir,
  writeArchiveSnapshot,
} from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rmDirWithRetries } from '@/test';

const posix = (p: string): string =>
  p.replace(/\\+/g, '/').replace(/^\.\/+/, '');

const readNullTerminated = (
  buf: Buffer,
  start: number,
  len: number,
): string => {
  const slice = buf.subarray(start, start + len);
  const nul = slice.indexOf(0);
  const bytes = nul >= 0 ? slice.subarray(0, nul) : slice;
  return bytes.toString('utf8');
};

const parseOctal = (raw: string): number => {
  const t = raw.replace(/\0.*$/, '').trim();
  if (!t) return 0;
  const n = Number.parseInt(t, 8);
  return Number.isFinite(n) ? n : 0;
};

const isAllZero = (b: Buffer): boolean => {
  for (const x of b) if (x !== 0) return false;
  return true;
};

/**
 * Minimal tar entry lister (POSIX names).
 * - Supports ustar prefix+name composition.
 * - Stops on the first all-zero 512-byte header block.
 */
const listTarEntries = async (abs: string): Promise<string[]> => {
  const buf = await readFile(abs);
  const out: string[] = [];

  let off = 0;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (isAllZero(header)) break;

    const name = readNullTerminated(buf, off + 0, 100);
    const sizeRaw = readNullTerminated(buf, off + 124, 12);
    const prefix = readNullTerminated(buf, off + 345, 155);

    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = parseOctal(sizeRaw);

    if (fullName.trim().length > 0) out.push(posix(fullName));

    // advance: header + file body padded to 512
    const padded = Math.ceil(size / 512) * 512;
    off += 512 + padded;
  }

  return out.map(posix).map((p) => p.replace(/^\.\/+/, ''));
};

describe('diff archive anchors (new file vs snapshot baseline)', () => {
  let dir: string;
  const stanPath = '.stan';
  const anchoredRel = '.stan/system/facet.state.json';
  const anchors = [anchoredRel];

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-diff-anchors-new-'));
  });

  afterEach(async () => {
    await rmDirWithRetries(dir);
  });

  it('includes a newly introduced anchored file once (when absent from snapshot baseline)', async () => {
    // Ensure workspace exists
    await ensureOutputDir(dir, stanPath, true);

    // Gitignore the anchored file (real-world behavior).
    await writeFile(path.join(dir, '.gitignore'), `${anchoredRel}\n`, 'utf8');

    // Snapshot baseline: anchored file does NOT exist yet.
    await writeArchiveSnapshot({
      cwd: dir,
      stanPath,
      includes: [],
      excludes: [],
      anchors,
    });

    // Create the anchored file AFTER the snapshot baseline.
    await mkdir(path.join(dir, '.stan', 'system'), { recursive: true });
    await writeFile(
      path.join(dir, anchoredRel),
      JSON.stringify({ overlay: { enabled: true } }, null, 2) + '\n',
      'utf8',
    );

    // Diff should include the newly added anchored file as "added".
    const out = await createArchiveDiff({
      cwd: dir,
      stanPath,
      baseName: 'archive',
      includes: [],
      excludes: [],
      anchors,
      updateSnapshot: 'createIfMissing',
      includeOutputDirInDiff: false,
    });

    const entries = await listTarEntries(out.diffPath);
    expect(entries).toContain(anchoredRel);
    // Positive control: this is not a "no changes" diff.
    expect(entries.some((e) => e.endsWith('/.stan_no_changes'))).toBe(false);
  });
});
