import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rmDirWithRetries } from '@/test';

const makeTmp = async (): Promise<string> =>
  mkdtemp(path.join(tmpdir(), 'stan-imports-'));

describe('stageImports — clear root then stage current map', () => {
  let dir: string;

  beforeEach(async () => {
    vi.resetModules();
    dir = await makeTmp();
  });

  afterEach(async () => {
    await rmDirWithRetries(dir);
    vi.restoreAllMocks();
  });

  it('clears the entire <stanPath>/imports root even when no map provided', async () => {
    // Seed a lingering label directory: <dir>/stan/imports/foo/some.txt
    const stanPath = 'stan';
    const importsRoot = path.join(dir, stanPath, 'imports');
    const lingeringDir = path.join(importsRoot, 'foo');
    mkdirSync(lingeringDir, { recursive: true });
    writeFileSync(path.join(lingeringDir, 'some.txt'), 'x', 'utf8');

    // Mock core to observe calls (should not be called for undefined map).
    vi.doMock('@karmaniverous/stan-core', () => ({
      __esModule: true,
      prepareImports: vi.fn(async () => {}),
    }));

    // Import SUT after mocks
    const { stageImports } = (await import('@/runner/run/archive/util')) as {
      stageImports: (
        cwd: string,
        stanPath: string,
        imports?: Record<string, string[]> | null,
      ) => Promise<void>;
    };

    // Act: call with no map (undefined)
    await stageImports(dir, stanPath, undefined);

    // Assert: imports root exists but is empty
    const entries = await readdir(importsRoot).catch(() => [] as string[]);
    expect(entries.length).toBe(0);
  });

  it('clears root then stages current labels (removes dropped labels)', async () => {
    const stanPath = 'stan';
    const importsRoot = path.join(dir, stanPath, 'imports');
    const oldLabel = path.join(importsRoot, 'oldlabel');
    mkdirSync(oldLabel, { recursive: true });
    writeFileSync(path.join(oldLabel, 'stale.txt'), 'old', 'utf8');

    // Repository file to "stage"
    const srcFile = path.join(dir, 'source.txt');
    writeFileSync(srcFile, 'hello', 'utf8');

    // Mock core.prepareImports to simulate staging "bar": ['source.txt']
    const prepareMock = vi.fn(
      async (args: {
        cwd: string;
        stanPath: string;
        map?: Record<string, string[]>;
      }) => {
        // satisfy require-await rule for async mock
        await Promise.resolve();
        const { cwd, stanPath, map } = args;
        if (!map) return;
        const entries = Object.entries(map);
        for (const [label, files] of entries) {
          const labelDir = path.join(cwd, stanPath, 'imports', label);
          mkdirSync(labelDir, { recursive: true });
          for (const f of files) {
            const srcAbs = path.join(cwd, f);
            const destAbs = path.join(labelDir, path.basename(f));
            // best-effort: copy by reading/writing; no need for fs-extra in test
            writeFileSync(destAbs, existsSync(srcAbs) ? 'staged' : '', 'utf8');
          }
        }
      },
    );
    vi.doMock('@karmaniverous/stan-core', () => ({
      __esModule: true,
      prepareImports: prepareMock,
    }));

    const { stageImports } = (await import('@/runner/run/archive/util')) as {
      stageImports: (
        cwd: string,
        stanPath: string,
        imports?: Record<string, string[]> | null,
      ) => Promise<void>;
    };

    // Act: call with a new label "bar"
    await stageImports(dir, stanPath, { bar: ['source.txt'] });

    // Assert: "oldlabel" is gone; "bar" exists with a staged file
    const oldExists = existsSync(oldLabel);
    const barFile = path.join(importsRoot, 'bar', 'source.txt');
    expect(oldExists).toBe(false);
    expect(existsSync(barFile)).toBe(true);
  });
});
