import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareImports } from './stage';

const read = (p: string) => readFile(p, 'utf8');

describe('prepareImports (staging under <stanPath>/imports)', () => {
  let dir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-imports-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it('stages files per label and preserves tail under glob-parent', async () => {
    const root = path.join(dir, 'ext');
    await mkdir(path.join(root, 'api', 'v1'), { recursive: true });
    const a = path.join(root, 'types.d.ts');
    const b = path.join(root, 'api', 'v1', 'openapi.json');
    await writeFile(a, 'declare type X = 1;\n', 'utf8');
    await writeFile(b, '{"openapi":"3.1.0"}\n', 'utf8');

    await prepareImports({
      cwd: dir,
      stanPath: '.stan',
      map: {
        '@scope/pkg': ['ext/**/*.d.ts', 'ext/api/**/*.json'],
      },
    });

    const stagedA = path.join(
      dir,
      '.stan',
      'imports',
      '@scope/pkg',
      'types.d.ts',
    );
    const stagedB = path.join(
      dir,
      '.stan',
      'imports',
      '@scope/pkg',
      'v1',
      'openapi.json',
    );
    const tA = await read(stagedA);
    const tB = await read(stagedB);
    expect(tA.includes('declare type X')).toBe(true);
    expect(tB.includes('"openapi"')).toBe(true);
    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logs).toMatch(/stan:\s*import\s*@scope\/pkg\s*->\s*\d+\s*file/);
  });
});
