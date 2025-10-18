import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  computeFacetOverlay,
  type FacetMeta,
  type FacetState,
} from '@/runner/overlay/facets';
import { rmDirWithRetries } from '@/test';

const writeJson = async (abs: string, v: unknown) => {
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(v, null, 2), 'utf8');
};

describe('computeFacetOverlay', () => {
  let cwd: string;
  const stanPath = 'stan';
  const sys = (...parts: string[]) =>
    path.join(cwd, stanPath, 'system', ...parts);

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'stan-facets-'));
  });

  afterEach(async () => {
    await rmDirWithRetries(cwd);
  });

  it('applies per-run activate/deactivate precedence and populates excludesOverlay when anchors exist', async () => {
    // meta: two facets, each with an exclude root and one anchor file
    const meta: FacetMeta = {
      a: { exclude: ['foo/**'], include: ['foo/README.md'] },
      b: { exclude: ['docs/**'], include: ['docs/KEEP.md'] },
    };
    const state: FacetState = {
      a: false, // base inactive
      b: true, // base active
    };
    // materialize anchors on disk
    await writeJson(sys('facet.meta.json'), meta);
    await writeJson(sys('facet.state.json'), state);
    await mkdir(path.join(cwd, 'foo'), { recursive: true });
    await mkdir(path.join(cwd, 'docs'), { recursive: true });
    await writeFile(path.join(cwd, 'foo', 'README.md'), '# a\n', 'utf8');
    await writeFile(path.join(cwd, 'docs', 'KEEP.md'), '# b\n', 'utf8');

    // Activate "a"; Deactivate "b" for this run.
    const out = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled: true,
      activate: ['a'],
      deactivate: ['b'],
    });

    // effective: a=true (override), b=false (override)
    expect(out.effective.a).toBe(true);
    expect(out.effective.b).toBe(false);
    // anchors union contains both facet anchors
    expect(out.anchorsOverlay.sort()).toEqual(
      ['foo/README.md', 'docs/KEEP.md'].sort(),
    );
    // excludes overlay includes root for b only (inactive with present anchor)
    // stripGlobTail('docs/**') -> 'docs'
    expect(out.excludesOverlay).toEqual(['docs']);
    // autosuspended none (anchors present under excluded root for b; a is active)
    expect(out.autosuspended).toEqual([]);
    // anchors-kept counts reflect on-disk presence
    expect(out.anchorsKeptCounts).toMatchObject({ a: 1, b: 1 });
  });

  it('ramp-up safety: autosuspends drop when no anchor exists under excluded roots', async () => {
    const meta: FacetMeta = {
      pkg: { exclude: ['packages/**'], include: ['packages/README.md'] },
    };
    const state: FacetState = { pkg: false };
    await writeJson(sys('facet.meta.json'), meta);
    await writeJson(sys('facet.state.json'), state);
    // Do NOT create any anchor under packages/** -> autosuspend expected
    const out = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled: true,
    });
    expect(out.effective.pkg).toBe(true); // auto-suspended -> treated active
    expect(out.autosuspended).toEqual(['pkg']);
    expect(out.excludesOverlay).toEqual([]); // no drop applied
    expect(out.anchorsKeptCounts.pkg).toBe(0);
  });

  it('overlay disabled: returns anchors union and counts but no excludes overlay', async () => {
    const meta: FacetMeta = {
      x: { exclude: ['x/**'], include: ['x/A.md'] },
      y: { exclude: ['y/**'], include: ['y/B.md'] },
    };
    const state: FacetState = { x: false, y: false };
    await writeJson(sys('facet.meta.json'), meta);
    await writeJson(sys('facet.state.json'), state);
    await mkdir(path.join(cwd, 'x'), { recursive: true });
    await writeFile(path.join(cwd, 'x', 'A.md'), 'A', 'utf8');
    // y.B anchor absent

    const out = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled: false,
    });
    // overlay disabled
    expect(out.enabled).toBe(false);
    // anchors kept reflect real files (x=1,y=0)
    expect(out.anchorsKeptCounts).toMatchObject({ x: 1, y: 0 });
    // excludes overlay is empty; anchorsOverlay still announced
    expect(out.excludesOverlay).toEqual([]);
    expect(out.anchorsOverlay.sort()).toEqual(['x/A.md', 'y/B.md'].sort());
  });

  it('naked -f (activate all) overrides state for this run', async () => {
    const meta: FacetMeta = {
      a: { exclude: ['a/**'], include: ['a/README.md'] },
      b: { exclude: ['b/**'], include: ['b/README.md'] },
    };
    const state: FacetState = { a: false, b: false };
    await writeJson(sys('facet.meta.json'), meta);
    await writeJson(sys('facet.state.json'), state);
    const out = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled: true,
      nakedActivateAll: true,
    });
    expect(out.effective).toMatchObject({ a: true, b: true });
    expect(out.excludesOverlay).toEqual([]); // nothing inactive
  });
});
