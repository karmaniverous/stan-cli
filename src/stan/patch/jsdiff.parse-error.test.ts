import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyWithJsDiff } from './jsdiff';

describe('applyWithJsDiff — invalid diff handling', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-jsdiff-err-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns failure outcome without throwing on invalid unified diff', async () => {
    const bad = 'NOT A DIFF\n(no headers here)\n';
    const out = await applyWithJsDiff({
      cwd: dir,
      cleaned: bad,
      check: false,
    });
    expect(out.okFiles).toEqual([]);
    expect(out.failed.length).toBeGreaterThan(0);
    expect(out.failed[0].reason).toMatch(/invalid unified diff|unable/i);
  });
});
