import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyWithJsDiff } from './jsdiff';

describe('applyWithJsDiff — coverage for success, sandbox/check, and failures', () => {
  let dir: string;

  const readUtf8 = (p: string) => readFile(p, 'utf8');

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-jsdiff-apply-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('applies patch to existing LF file and preserves LF endings', async () => {
    const rel = 'a.txt';
    const abs = path.join(dir, rel);
    await writeFile(abs, 'old\nline2\n', 'utf8');

    const diff = [
      `diff --git a/${rel} b/${rel}`,
      `--- a/${rel}`,
      `+++ b/${rel}`,
      '@@ -1,2 +1,2 @@',
      '-old',
      '+new',
      ' line2',
      '',
    ].join('\n');

    const out = await applyWithJsDiff({
      cwd: dir,
      cleaned: diff,
      check: false,
    });
    expect(out.failed).toEqual([]);
    expect(out.okFiles).toEqual([rel]);

    const body = await readUtf8(abs);
    expect(body).toBe('new\nline2\n');
    expect(/\r\n/.test(body)).toBe(false); // still LF
  });

  it('check=true writes to provided sandboxRoot and does not modify repo files', async () => {
    const rel = 'b.txt';
    const abs = path.join(dir, rel);
    await writeFile(abs, 'foo\n', 'utf8');

    const diff = [
      `diff --git a/${rel} b/${rel}`,
      `--- a/${rel}`,
      `+++ b/${rel}`,
      '@@ -1,1 +1,1 @@',
      '-foo',
      '+bar',
      '',
    ].join('\n');

    const sandboxRoot = path.join(dir, '.stan', 'patch', '.sandbox', 'X');

    const out = await applyWithJsDiff({
      cwd: dir,
      cleaned: diff,
      check: true,
      sandboxRoot,
    });

    expect(out.failed).toEqual([]);
    expect(out.okFiles).toEqual([rel]);

    // repo file unchanged
    const repoBody = await readUtf8(abs);
    expect(repoBody).toBe('foo\n');

    // sandbox file updated
    const sandAbs = path.join(sandboxRoot, rel);
    const sandBody = await readUtf8(sandAbs);
    expect(sandBody).toBe('bar\n');
  });

  it('reports failure when target file does not exist', async () => {
    const rel = 'c.txt'; // not created
    const diff = [
      `diff --git a/${rel} b/${rel}`,
      `--- a/${rel}`,
      `+++ b/${rel}`,
      '@@ -1,1 +1,1 @@',
      '-x',
      '+y',
      '',
    ].join('\n');

    const out = await applyWithJsDiff({
      cwd: dir,
      cleaned: diff,
      check: false,
    });
    expect(out.okFiles).toEqual([]);
    expect(out.failed.length).toBeGreaterThan(0);
    expect(out.failed[0].path).toBe(rel);
    expect(out.failed[0].reason).toMatch(/target file not found/i);
  });

  it('reports placement failure when hunk does not match', async () => {
    const rel = 'd.txt';
    const abs = path.join(dir, rel);
    await writeFile(abs, 'line1\n', 'utf8');

    // Context is intentionally wrong; should not match existing content.
    const diff = [
      `diff --git a/${rel} b/${rel}`,
      `--- a/${rel}`,
      `+++ b/${rel}`,
      '@@ -1,1 +1,1 @@',
      '-NOPE',
      '+line1',
      '',
    ].join('\n');

    const out = await applyWithJsDiff({
      cwd: dir,
      cleaned: diff,
      check: false,
    });
    expect(out.okFiles).toEqual([]);
    expect(out.failed.length).toBeGreaterThan(0);
    expect(out.failed[0].path).toBe(rel);
    expect(out.failed[0].reason).toMatch(/unable to place hunk/i);
  });
});
