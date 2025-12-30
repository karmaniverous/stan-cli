import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ensureOutputDir,
  writeArchiveSnapshot,
} from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { archivePhase } from '@/runner/run/archive';
import { withImplicitImportsInclude } from '@/runner/selection/implicit-imports';
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

describe('diff archive includes imports only when changed (gitignored)', () => {
  let dir: string;
  const stanPath = '.stan';
  const importsRel = '.stan/imports/example/hello.txt';

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-diff-imports-'));
  });

  afterEach(async () => {
    await rmDirWithRetries(dir);
  });

  it('does not include unchanged imports; includes changed imports', async () => {
    await ensureOutputDir(dir, stanPath, true);

    // Gitignore imports root (this is the new default behavior on init).
    await writeFile(
      path.join(dir, '.gitignore'),
      `${stanPath}/imports/\n`,
      'utf8',
    );

    // Create an imports file on disk.
    await mkdir(path.join(dir, stanPath, 'imports', 'example'), {
      recursive: true,
    });
    await writeFile(path.join(dir, importsRel), 'one\n', 'utf8');

    // Snapshot baseline includes imports via the implicit include.
    await writeArchiveSnapshot({
      cwd: dir,
      stanPath,
      includes: withImplicitImportsInclude(stanPath, []),
      excludes: [],
      anchors: [],
    });

    // Diff (unchanged) should not include the imports file.
    const first = await archivePhase(
      {
        cwd: dir,
        config: {
          stanPath,
          includes: [],
          excludes: [],
          anchors: [],
        },
        includeOutputs: false,
      },
      { silent: true, which: 'diff', stage: false, cleanup: false },
    );
    expect(first.diffPath).toBeTruthy();
    const entries0 = await listTarEntries(first.diffPath as string);
    expect(entries0).not.toContain(importsRel);
    expect(entries0.some((e) => e.endsWith('/.stan_no_changes'))).toBe(true);

    // Change the imports file.
    await writeFile(path.join(dir, importsRel), 'two\n', 'utf8');

    const second = await archivePhase(
      {
        cwd: dir,
        config: {
          stanPath,
          includes: [],
          excludes: [],
          anchors: [],
        },
        includeOutputs: false,
      },
      { silent: true, which: 'diff', stage: false, cleanup: false },
    );
    expect(second.diffPath).toBeTruthy();
    const entries1 = await listTarEntries(second.diffPath as string);
    expect(entries1).toContain(importsRel);
  });
});
