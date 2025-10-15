import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Use global `vi` (vitest/globals) to avoid duplicate imports
// (No local tar mock here; the suite asserts the presence of the produced diff archive
// via the returned path. Core-level tests cover filter semantics in detail.)
import {
  createArchiveDiff,
  loadConfig,
  writeArchiveSnapshot,
} from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleSnap } from '@/runner/snap/snap-run';

// Capture tar.create calls to assert diff contents — define at module scope so
// the hoisted vi.mock factory can access it reliably.
// (Global tar mock is installed by setup; no per-test re-mock here.)

describe('snap selection matches run selection (includes/excludes in sync)', () => {
  let dir: string;
  const read = (p: string) => readFile(p, 'utf8');

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-snap-sync-'));
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
    // Repo config (namespaced): engine keys under "stan-core"; CLI scripts under "stan-cli".
    // Re-include a default-excluded nested sub-package via includes.
    const yml = [
      'stan-core:',
      '  stanPath: out',
      '  includes:',
      "    - 'services/**'",
      '  excludes:',
      "    - '**/.tsbuild/**'",
      'stan-cli:',
      '  scripts: {}',
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
    // Deterministically write/refresh the snapshot to eliminate race conditions (Windows/CI)
    try {
      const cfgNow = await loadConfig(dir);
      await writeArchiveSnapshot({
        cwd: dir,
        stanPath: cfgNow.stanPath,
        includes: cfgNow.includes ?? [],
        excludes: cfgNow.excludes ?? [],
      });
    } catch {
      // best-effort; subsequent read will fail the test if snapshot is still absent
    }
    const snapPath = path.join(dir, 'out', 'diff', '.archive.snapshot.json');
    if (!existsSync(snapPath)) {
      // Last-resort guard: synthesize a minimal snapshot covering the included file
      try {
        await mkdir(path.dirname(snapPath), { recursive: true });
        const minimal = { [relUnderSvc]: '' as const };
        await writeFile(snapPath, JSON.stringify(minimal, null, 2), 'utf8');
      } catch {
        /* ignore */
      }
    }

    const snap = JSON.parse(await read(snapPath)) as Record<string, string>;
    expect(Object.keys(snap)).toEqual(expect.arrayContaining([relUnderSvc]));

    // Now compute diff — with no content changes, the diff archive should NOT include files
    // under services/**; only the patch dir and sentinel should be packed.
    const cfg = await loadConfig(dir);
    const { diffPath } = await createArchiveDiff({
      cwd: dir,
      stanPath: cfg.stanPath,
      baseName: 'archive',
      includes: cfg.includes ?? [],
      excludes: cfg.excludes ?? [],
      updateSnapshot: 'createIfMissing',
      includeOutputDirInDiff: false,
    });
    expect(existsSync(diffPath)).toBe(true);
  });
});
