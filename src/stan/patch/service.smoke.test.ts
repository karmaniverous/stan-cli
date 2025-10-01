import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the worktree-first patch pipeline to succeed (no jsdiff fallback needed)
vi.mock('./run/pipeline', () => ({
  __esModule: true,
  applyPatchPipeline: async () => ({
    ok: true,
    result: { ok: true, tried: ['t1'], lastCode: 0, captures: [] },
    js: null,
  }),
}));

// Keep diagnostics and feedback real (they write under .stan/patch/.debug), or mock lightly if desired
// vi.mock('./run/diagnostics', () => ({ __esModule: true, writePatchDiagnostics: async (..._args: unknown[]) => ({ attemptsRel: '', debugRel: '' }) }));

import { runPatch } from './service';

describe('runPatch (service smoke test)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-service-'));
    // Create a target file to reference in the diff (content immaterial since pipeline is mocked)
    await writeFile(path.join(dir, 'foo.txt'), 'old\n', 'utf8');
  });

  afterEach(async () => {
    try {
      // Leave temp dir before deleting (Windows safety)
      process.chdir(tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('applies a provided unified diff (argument source) and logs success', async () => {
    // Minimal unified diff with a/ b/ prefixes and a single hunk
    const diff = [
      'diff --git a/foo.txt b/foo.txt',
      '--- a/foo.txt',
      '+++ b/foo.txt',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runPatch(dir, diff); // provide as argument; no clipboard or file reading

    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    // Accept BORING or TTY banner forms
    expect(logs.some((l) => /(?:✔|\[OK\])\s+patch applied/i.test(l))).toBe(
      true,
    );

    // Should not print error in success path
    const errs = errSpy.mock.calls.map((c) => String(c[0]));
    expect(errs.length).toBe(0);

    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});
