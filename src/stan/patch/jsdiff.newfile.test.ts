import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyWithJsDiff } from './jsdiff';

describe('applyWithJsDiff — creates new files when old side is /dev/null', () => {
  let dir: string;

  const readUtf8 = (p: string) => readFile(p, 'utf8');

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-jsdiff-newfile-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates a new file from a /dev/null patch (LF)', async () => {
    const rel = 'n.txt';
    const diff = [
      `diff --git a/${rel} b/${rel}`,
      `--- /dev/null`,
      `+++ b/${rel}`,
      '@@ -0,0 +1,3 @@',
      '+alpha',
      '+bravo',
      '+charlie',
      '',
    ].join('\n');

    const out = await applyWithJsDiff({
      cwd: dir,
      cleaned: diff,
      check: false,
    });
    expect(out.failed).toEqual([]);
    expect(out.okFiles).toEqual([rel]);
    const body = await readUtf8(path.join(dir, rel));
    expect(body).toBe(['alpha', 'bravo', 'charlie', ''].join('\n'));
  });

  it('writes to sandbox (check=true) without touching repo when creating a file', async () => {
    const rel = 'newfile.md';
    const diff = [
      `diff --git a/${rel} b/${rel}`,
      `--- /dev/null`,
      `+++ b/${rel}`,
      '@@ -0,0 +1,2 @@',
      '+# Title',
      '+Body',
      '',
    ].join('\n');

    const sandboxRoot = path.join(dir, '.stan', 'patch', '.sandbox', 'T');
    const out = await applyWithJsDiff({
      cwd: dir,
      cleaned: diff,
      check: true,
      sandboxRoot,
    });
    expect(out.failed).toEqual([]);
    expect(out.okFiles).toEqual([rel]);
    // repo file absent
    await expect(readFile(path.join(dir, rel), 'utf8')).rejects.toBeTruthy();
    // sandbox file present
    const sand = await readUtf8(path.join(sandboxRoot, rel));
    expect(sand).toContain('# Title');
  });
});
