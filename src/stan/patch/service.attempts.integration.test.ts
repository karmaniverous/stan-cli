import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Force STAN-repo context so diagnostics envelope (with attempts) is used.
vi.mock('../version', () => ({
  __esModule: true,
  getVersionInfo: async () => ({
    packageVersion: '0.0.0-test',
    nodeVersion: process.version,
    repoRoot: process.cwd(),
    stanPath: 'out',
    isDevModuleRepo: true,
    systemPrompt: { localExists: true, baselineExists: true, inSync: true },
    docsMeta: null,
  }),
}));

// Drive the pipeline outcome to fail via git across multiple attempts and no jsdiff fix.
vi.mock('./run/pipeline', () => ({
  __esModule: true,
  applyPatchPipeline: async () => ({
    ok: false,
    result: {
      ok: false,
      tried: [
        '3way+nowarn-p1',
        '3way+ignore-p1',
        '2way+nowarn-p1',
        '2way+ignore-p1',
        '3way+nowarn-p0',
        '3way+ignore-p0',
        '2way+nowarn-p0',
        '2way+ignore-p0',
      ],
      lastCode: 1,
      captures: [
        {
          label: '3way+nowarn-p1',
          code: 1,
          stdout: '',
          stderr: 'error: conflict p1 nowarn',
        },
        {
          label: '3way+ignore-p1',
          code: 1,
          stdout: '',
          stderr: 'error: conflict p1 ignore',
        },
        {
          label: '2way+nowarn-p1',
          code: 1,
          stdout: '',
          stderr: 'error: rejects p1 nowarn',
        },
        {
          label: '2way+ignore-p1',
          code: 1,
          stdout: '',
          stderr: 'error: rejects p1 ignore',
        },
        {
          label: '3way+nowarn-p0',
          code: 1,
          stdout: '',
          stderr: 'error: conflict p0 nowarn',
        },
        {
          label: '3way+ignore-p0',
          code: 1,
          stdout: '',
          stderr: 'error: conflict p0 ignore',
        },
        {
          label: '2way+nowarn-p0',
          code: 1,
          stdout: '',
          stderr: 'error: rejects p0 nowarn',
        },
        {
          label: '2way+ignore-p0',
          code: 1,
          stdout: '',
          stderr: 'error: rejects p0 ignore',
        },
      ],
    },
    js: { okFiles: [], failed: [], sandboxRoot: undefined },
  }),
}));

import { runPatch } from './service';

describe('integration: attempts[] summary appears when git fails across p1→p0', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-attempts-'));
    // minimal target file referenced by the diff
    await writeFile(path.join(dir, 'foo.txt'), 'old\n', 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('emits ordered attempt summary lines inside diagnostics envelope', async () => {
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

    const body = logs.join('\n');
    // Envelope present
    expect(body).toMatch(/START PATCH DIAGNOSTICS/);
    // Ordered summaries present
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expectLine = (s: string) =>
      expect(body).toMatch(new RegExp(`^${escapeRe(s)}\\b`, 'm'));
    expectLine('3way+nowarn-p1: exit 1 — error: conflict p1 nowarn');
    expectLine('3way+ignore-p1: exit 1 — error: conflict p1 ignore');
    expectLine('2way+nowarn-p1: exit 1 — error: rejects p1 nowarn');
    expectLine('2way+ignore-p1: exit 1 — error: rejects p1 ignore');
    expectLine('3way+nowarn-p0: exit 1 — error: conflict p0 nowarn');
    expectLine('3way+ignore-p0: exit 1 — error: conflict p0 ignore');
    expectLine('2way+nowarn-p0: exit 1 — error: rejects p0 nowarn');
    expectLine('2way+ignore-p0: exit 1 — error: rejects p0 ignore');
    expect(body).toMatch(/END PATCH DIAGNOSTICS/);
  });
});
