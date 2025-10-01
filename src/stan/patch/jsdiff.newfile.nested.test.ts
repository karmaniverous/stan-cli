import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyWithJsDiff } from './jsdiff';

describe('applyWithJsDiff — creates nested new files (ensures parent dirs)', () => {
  let dir: string;

  const readUtf8 = (p: string) => readFile(p, 'utf8');

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-jsdiff-nested-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates a new file under a nested path from a /dev/null patch (non-check write)', async () => {
    const rel = path.posix.join('src', 'rrstack', 'describe', 'lexicon.ts');
    const diff = [
      `diff --git a/${rel} b/${rel}`,
      `--- /dev/null`,
      `+++ b/${rel}`,
      '@@ -0,0 +1,5 @@',
      "+export const hello = 'world';",
      '+export type T = { x: number }',
      '+export function f(t: T) { return t.x; }',
      '+',
      '+// nested path creation should not fail',
      '',
    ].join('\n');

    const out = await applyWithJsDiff({
      cwd: dir,
      cleaned: diff,
      check: false,
    });
    expect(out.failed).toEqual([]);
    expect(out.okFiles).toEqual([rel]);

    const abs = path.join(dir, ...rel.split('/'));
    const body = await readUtf8(abs);
    expect(body).toContain("export const hello = 'world';");
    expect(body.endsWith('\n')).toBe(true);
  });
});
