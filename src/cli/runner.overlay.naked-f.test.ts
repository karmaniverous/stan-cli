import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildOverlayInputs } from '@/cli/run/action/overlay';

describe('overlay excludes mapping — naked -f (no names)', () => {
  let dir: string;
  const stanPath = 'out';

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-overlay-naked-'));
    // Minimal workspace
    await mkdir(path.join(dir, stanPath, 'system'), { recursive: true });
    // facet.meta.json: one facet with a subtree exclude and an anchor
    const meta = {
      docs: {
        exclude: ['docs/**'],
        include: ['docs/index.md'],
      },
    };
    await writeFile(
      path.join(dir, stanPath, 'system', 'facet.meta.json'),
      JSON.stringify(meta, null, 2),
      'utf8',
    );
    // facet.state.json: default state (could be either; naked -f activates all)
    const state = { docs: false };
    await writeFile(
      path.join(dir, stanPath, 'system', 'facet.state.json'),
      JSON.stringify(state, null, 2),
      'utf8',
    );
    // Create the anchor so ramp-up safety does not auto-suspend
    await mkdir(path.join(dir, 'docs'), { recursive: true });
    await writeFile(path.join(dir, 'docs', 'index.md'), '# docs\n', 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('maps with naked -f (overlay enabled for this run, all facets active) and yields no engine excludes', async () => {
    const out = await buildOverlayInputs({
      cwd: dir,
      stanPath,
      // Global overlay flag off, but naked -f triggers mapping shortcut
      enabled: false,
      activateNames: [],
      deactivateNames: [],
      nakedActivateAll: true,
    });
    // Effective overlay is considered ON for the purpose of plan/meta,
    // but all facets are active, so we expect no subtree excludes in engineExcludes.
    expect(Array.isArray(out.engineExcludes)).toBe(true);
    expect(out.engineExcludes.length).toBe(0);
    // Facet view should still be present for plan summary (overlay ON / no inactive facets).
    expect(Array.isArray(out.overlayPlan)).toBe(true);
    expect(out.overlayPlan?.some((l) => /overlay:\s+on/i.test(l))).toBe(true);
  });
});
