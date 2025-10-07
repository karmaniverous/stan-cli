import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// Use global `vi` (vitest/globals) to avoid duplicate imports

// Ensure tar calls are always captured for this test, independent of setup timing.
// Writes to the same global store used by '@/test/mock-tar'.
vi.mock('tar', () => {
  const ensureStore = (): Array<{
    file: string;
    cwd?: string;
    filter?: (p: string, s: unknown) => boolean;
    files: string[];
  }> => {
    if (!globalThis.__TAR_CALLS__) globalThis.__TAR_CALLS__ = [];
    return globalThis.__TAR_CALLS__;
  };
  const record = async (
    opts: {
      file: string;
      cwd?: string;
      filter?: (p: string, s: unknown) => boolean;
    },
    files: string[],
  ) => {
    ensureStore().push({
      file: opts.file,
      cwd: opts.cwd,
      filter: opts.filter,
      files,
    });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(opts.file, 'TAR', 'utf8');
  };
  return { __esModule: true, default: undefined, create: record, c: record };
});

import { createArchiveDiff, loadConfig } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleSnap } from '@/stan/snap/snap-run';
import { __clearTarCalls, __tarCalls, type TarCall } from '@/test/mock-tar';

// Silence preflight messaging in tests
vi.mock('@/stan/preflight', () => ({
  __esModule: true,
  preflightDocsAndVersion: async () => {},
}));

// Capture tar.create calls to assert diff contents — define at module scope so
// the hoisted vi.mock factory can access it reliably.
// (Global tar mock is installed by setup; no per-test re-mock here.)

describe('snap selection matches run selection (includes/excludes in sync)', () => {
  let dir: string;
  const read = (p: string) => readFile(p, 'utf8');

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-snap-sync-'));
    __clearTarCalls(); // reset captured calls between tests
    try {
      process.chdir(dir);
    } catch {
      // ignore
    }
  });

  afterEach(async () => {
    // leave temp dir before removal (Windows safety)
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('snap includes re-included sub-packages so diff shows no phantom files', async () => {
    // Repo config: re-include a default-excluded nested sub-package
    const yml = [
      'stanPath: out',
      'includes:',
      "  - 'services/**'",
      'excludes:',
      "  - '**/.tsbuild/**'",
      'scripts: {}',
    ].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');
    // Nested sub-package (default excluded): should be brought back by includes
    const pkgRoot = path.join(dir, 'services', 'activecampaign');
    await mkdir(path.join(pkgRoot, 'src'), { recursive: true });
    await writeFile(
      path.join(pkgRoot, 'package.json'),
      JSON.stringify({ name: 'activecampaign' }),
      'utf8',
    );
    const relUnderSvc = path
      .join('services', 'activecampaign', 'src', 'a.ts')
      .replace(/\\/g, '/');
    await writeFile(
      path.join(dir, relUnderSvc),
      'export const a = 1;\n',
      'utf8',
    );

    // Run snap — snapshot should honor includes/excludes from config
    await handleSnap();

    // Verify snapshot contains the file under the included sub-package
    const snapPath = path.join(dir, 'out', 'diff', '.archive.snapshot.json');
    const snap = JSON.parse(await read(snapPath)) as Record<string, string>;
    expect(Object.keys(snap)).toEqual(expect.arrayContaining([relUnderSvc]));

    // Now compute diff — with no content changes, the diff archive should NOT include files
    // under services/**; only the patch dir and sentinel should be packed.
    const cfg = await loadConfig(dir);
    await createArchiveDiff({
      cwd: dir,
      stanPath: cfg.stanPath,
      baseName: 'archive',
      includes: cfg.includes ?? [],
      excludes: cfg.excludes ?? [],
      updateSnapshot: 'createIfMissing',
      includeOutputDirInDiff: false,
    });

    const calls = __tarCalls();
    const diffCall = calls.find((c) => c.file.endsWith('archive.diff.tar'));
    expect(diffCall).toBeTruthy();
    const filesPacked = diffCall?.files ?? [];

    // Zero-change branch should only include the sentinel; no services/**
    expect(filesPacked.some((p) => p.startsWith('services/'))).toBe(false);
    expect(filesPacked).toEqual(
      expect.arrayContaining([
        `${cfg.stanPath.replace(/\\/g, '/')}/diff/.stan_no_changes`,
      ]),
    );
    // In downstream repos, patch workspace is not force-included in diff archives
    expect(
      filesPacked.some((p) =>
        p.startsWith(`${cfg.stanPath.replace(/\\/g, '/')}/patch`),
      ),
    ).toBe(false);
  });
});
