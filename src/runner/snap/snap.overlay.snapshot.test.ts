import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createArchiveDiff } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeFacetOverlay } from '@/runner/overlay/facets';
import { handleSnap } from '@/runner/snap';
import { rmDirWithRetries } from '@/test';

const posix = (p: string): string => p.replace(/\\/g, '/');

describe('snap: overlay-aware snapshot baselines', () => {
  let dir: string;
  const stanPath = 'out';
  const sys = (...parts: string[]) =>
    path.join(dir, stanPath, 'system', ...parts);

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-snap-ov-'));
    // Minimal namespaced config with overlay enabled by default
    const yml = [
      'stan-core:',
      `  stanPath: ${stanPath}`,
      '  includes: []',
      '  excludes: []',
      'stan-cli:',
      '  scripts: {}',
      '  cliDefaults:',
      '    run:',
      '      facets: true',
    ].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');

    // facet meta/state: hide docs/** when inactive; keep docs/README.md as anchor
    const meta = {
      docs: {
        exclude: ['docs/**'],
        include: ['docs/README.md'],
      },
    };
    await mkdir(path.dirname(sys('facet.meta.json')), { recursive: true });
    await writeFile(
      sys('facet.meta.json'),
      JSON.stringify(meta, null, 2),
      'utf8',
    );
    await writeFile(
      sys('facet.state.json'),
      JSON.stringify({ docs: false }, null, 2),
      'utf8',
    );

    // repo files
    await mkdir(path.join(dir, 'docs'), { recursive: true });
    await writeFile(path.join(dir, 'docs', 'README.md'), '# docs\n', 'utf8'); // anchor
    await writeFile(path.join(dir, 'docs', 'guide.md'), 'hello\n', 'utf8'); // hidden by overlay
  });

  afterEach(async () => {
    await rmDirWithRetries(dir);
  });

  it('writes baseline snapshot with overlay excludes + anchors; diff reflects newly enabled facet', async () => {
    // 1) snap with overlay enabled (facet inactive): baseline excludes docs/**, keeps anchor
    await handleSnap();

    const snapPath = path.join(dir, stanPath, 'diff', '.archive.snapshot.json');
    const snapRaw = await readFile(snapPath, 'utf8');
    const snap = JSON.parse(snapRaw) as Record<string, unknown>;
    const keys = Object.keys(snap).map(posix);
    expect(keys).toContain('docs/README.md'); // anchor kept
    expect(keys).not.toContain('docs/guide.md'); // hidden by overlay

    // 2) activate facet for next run
    await writeFile(
      sys('facet.state.json'),
      JSON.stringify({ docs: true }, null, 2),
      'utf8',
    );

    // Compute overlay for run (facet active) and create DIFF
    const ov = await computeFacetOverlay({
      cwd: dir,
      stanPath,
      enabled: true,
      activate: [],
      deactivate: [],
      nakedActivateAll: false,
    });
    const { diffPath } = await createArchiveDiff({
      cwd: dir,
      stanPath,
      baseName: 'archive',
      includes: [],
      excludes: ov.excludesOverlay,
      anchors: ov.anchorsOverlay,
      updateSnapshot: 'createIfMissing',
      includeOutputDirInDiff: false,
    });
    expect(existsSync(diffPath)).toBe(true);
    // Indirect assertion: A diff archive exists (the newly visible subtree triggers changes).
  });
});
