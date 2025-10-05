import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createArchiveDiff, loadConfig } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSnap } from '@/stan/snap/snap-run';

// Silence preflight messaging in tests
vi.mock('@/stan/preflight', () => ({
  __esModule: true,
  preflightDocsAndVersion: async () => {},
}));

// Capture tar.create calls to assert diff contents — define at module scope so
// the hoisted vi.mock factory can access it reliably.
type TarCall = {
  file: string;
  cwd?: string;
  filter?: (p: string, s: unknown) => boolean;
  files: string[];
};
const calls: TarCall[] = [];

// Hoisted mock for 'tar': executed before the rest of the module body. It must
// only reference symbols declared at module scope (e.g., `calls`).
vi.mock('tar', () => {
  const record = async (
    opts: {
      file: string;
      cwd?: string;
      filter?: (p: string, s: unknown) => boolean;
    },
    files: string[],
  ) => {
    calls.push({
      file: opts.file,
      cwd: opts.cwd,
      filter: opts.filter,
      files,
    });
    // write a recognizable tar body
    const { writeFile } = await import('node:fs/promises');
    await writeFile(opts.file, 'TAR', 'utf8');
  };
  return {
    __esModule: true,
    default: undefined,
    create: record,
    c: record,
  };
});

describe('snap selection matches run selection (includes/excludes in sync)', () => {
  let dir: string;
  const read = (p: string) => readFile(p, 'utf8');

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-snap-sync-'));
    calls.length = 0; // reset captured calls between tests
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
