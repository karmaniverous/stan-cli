import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Dynamic stubs controlled per test
let gitResult: {
  ok: boolean;
  tried: string[];
  lastCode: number;
  captures: Array<{
    label: string;
    code: number;
    stdout: string;
    stderr: string;
  }>;
};
let jsResult: {
  okFiles: string[];
  failed: Array<{ path: string; reason: string }>;
  sandboxRoot?: string | null;
};

vi.mock('../apply', () => ({
  __esModule: true,
  buildApplyAttempts: () => [],
  runGitApply: async () => gitResult,
}));

vi.mock('../jsdiff', () => ({
  __esModule: true,
  applyWithJsDiff: async () => jsResult,
}));

describe('applyPatchPipeline (git path and jsdiff fallback)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-pipeline-'));
    vi.resetModules();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns ok via git path when git apply succeeds', async () => {
    gitResult = { ok: true, tried: [], lastCode: 0, captures: [] };
    jsResult = { okFiles: [], failed: [], sandboxRoot: null };

    const { applyPatchPipeline } = await import('./pipeline');
    const out = await applyPatchPipeline({
      cwd: dir,
      patchAbs: path.join(dir, '.stan', 'patch', '.patch'),
      cleaned: 'X',
      check: false,
    });
    expect(out.ok).toBe(true);
    expect(out.js).toBeNull();
  });

  it('returns ok via jsdiff fallback when git fails and jsdiff applies cleanly', async () => {
    gitResult = { ok: false, tried: ['t1'], lastCode: 1, captures: [] };
    jsResult = { okFiles: ['a.txt'], failed: [], sandboxRoot: null };

    const { applyPatchPipeline } = await import('./pipeline');
    const out = await applyPatchPipeline({
      cwd: dir,
      patchAbs: path.join(dir, '.stan', 'patch', '.patch'),
      cleaned: 'X',
      check: true,
    });
    expect(out.ok).toBe(true);
    expect(out.js && out.js.okFiles).toEqual(['a.txt']);
  });

  it('returns not ok when both git and jsdiff fail or are partial', async () => {
    gitResult = { ok: false, tried: ['t1'], lastCode: 1, captures: [] };
    jsResult = {
      okFiles: [],
      failed: [{ path: 'x', reason: 'fail' }],
      sandboxRoot: null,
    };

    const { applyPatchPipeline } = await import('./pipeline');
    const out = await applyPatchPipeline({
      cwd: dir,
      patchAbs: path.join(dir, '.stan', 'patch', '.patch'),
      cleaned: 'X',
      check: false,
    });
    expect(out.ok).toBe(false);
  });
});
