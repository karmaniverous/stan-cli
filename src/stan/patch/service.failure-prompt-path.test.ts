import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Force the pipeline to report a generic jsdiff parse failure with "(patch)"
vi.mock('./run/pipeline', () => ({
  __esModule: true,
  applyPatchPipeline: async () => ({
    ok: false,
    result: { ok: false, tried: ['t1'], lastCode: 1, captures: [] },
    js: {
      okFiles: [],
      failed: [{ path: '(patch)', reason: 'invalid unified diff' }],
      sandboxRoot: undefined,
    },
  }),
}));

import { runPatch } from './service';

describe('runPatch failure prompt uses real file path instead of "(patch)"', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-prompt-path-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints a one-line prompt per file using header-derived path', async () => {
    // Minimal unified diff with headers for foo.txt
    const diff = [
      'diff --git a/foo.txt b/foo.txt',
      '--- a/foo.txt',
      '+++ b/foo.txt',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });

    await runPatch(dir, diff);

    spy.mockRestore();
    const printed = logs.join('\n');
    // Ensure we do not see the placeholder "(patch)" and do see the real path
    expect(printed).toContain(
      'The unified diff patch for file foo.txt was invalid.',
    );
    expect(printed).not.toContain('The unified diff patch for file (patch)');
  });
});
