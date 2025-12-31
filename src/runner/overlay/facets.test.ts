import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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
    // anchors union contains facet anchors plus the always-anchored facet state file
    expect(out.anchorsOverlay.sort()).toEqual(
      [
        'foo/README.md',
        'docs/KEEP.md',
        'stan/system/facet.state.json',
        'stan/system/.docs.meta.json',
      ].sort(),
    );
    // excludes overlay includes root for b only (inactive with present anchor)
    expect(out.excludesOverlay).toEqual(['docs/**']);
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

  it('explicit per-run deactivate: does not autosuspend when anchors are missing', async () => {
    const meta: FacetMeta = {
      pkg: { exclude: ['packages/**'], include: ['packages/README.md'] },
    };
    const state: FacetState = { pkg: true }; // state active, but explicit off should win
    await writeJson(sys('facet.meta.json'), meta);
    await writeJson(sys('facet.state.json'), state);
    // Do NOT create any anchor under packages/** (anchor missing)
    const out = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled: true,
      deactivate: ['pkg'],
    });
    expect(out.effective.pkg).toBe(false);
    expect(out.autosuspended).toEqual([]);
    expect(out.excludesOverlay).toEqual(['packages/**']);
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
    expect(out.anchorsOverlay.sort()).toEqual(
      [
        'x/A.md',
        'y/B.md',
        'stan/system/facet.state.json',
        'stan/system/.docs.meta.json',
      ].sort(),
    );
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

  it('enabled-wins: drop inactive root equal to an active root', async () => {
    const meta: FacetMeta = {
      a: { exclude: ['docs/**'], include: ['docs/KEEP.md'] },
      b: { exclude: ['docs/**'], include: ['docs/KEEP.md'] },
    };
    const state: FacetState = { a: true, b: false };
    await writeJson(sys('facet.meta.json'), meta);
    await writeJson(sys('facet.state.json'), state);
    await mkdir(path.join(cwd, 'docs'), { recursive: true });
    await writeFile(path.join(cwd, 'docs', 'KEEP.md'), 'x', 'utf8');
    const out = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled: true,
    });
    // Inactive 'docs' root from b is dropped because a has same active root.
    expect(out.excludesOverlay).toEqual([]);
    // Anchors union remains
    expect(out.anchorsOverlay.sort()).toEqual(
      [
        'docs/KEEP.md',
        'stan/system/facet.state.json',
        'stan/system/.docs.meta.json',
      ].sort(),
    );
  });

  it('enabled-wins: drop inactive parent when active child root is present', async () => {
    const meta: FacetMeta = {
      a: { exclude: ['packages/app/**'], include: ['packages/app/ANCHOR.md'] },
      b: { exclude: ['packages/**'], include: ['packages/KEEP.md'] },
    };
    const state: FacetState = { a: true, b: false };
    await writeJson(sys('facet.meta.json'), meta);
    await writeJson(sys('facet.state.json'), state);
    // materialize anchors so ramp-up doesn’t autosuspend b
    await mkdir(path.join(cwd, 'packages', 'app'), { recursive: true });
    await writeFile(
      path.join(cwd, 'packages', 'app', 'ANCHOR.md'),
      'x',
      'utf8',
    );
    await writeFile(path.join(cwd, 'packages', 'KEEP.md'), 'x', 'utf8');
    // Additional siblings under packages (must be excluded by carve-out)
    await mkdir(path.join(cwd, 'packages', 'other'), { recursive: true });
    await writeFile(path.join(cwd, 'packages', 'other', 'X.md'), 'x', 'utf8');
    await writeFile(path.join(cwd, 'packages', 'ROOT.txt'), 'x', 'utf8');
    const out = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled: true,
    });
    // Carve-out: exclude non-protected siblings under packages, keep packages/app/**
    const ex = new Set(out.excludesOverlay);
    expect(ex.has('packages/KEEP.md')).toBe(true);
    expect(ex.has('packages/ROOT.txt')).toBe(true);
    expect(ex.has('packages/other/**')).toBe(true);
    // Anchors union includes both
    expect(out.anchorsOverlay.sort()).toEqual(
      [
        'packages/app/ANCHOR.md',
        'packages/KEEP.md',
        'stan/system/facet.state.json',
        'stan/system/.docs.meta.json',
      ].sort(),
    );
  });

  it('does not use anchors for leaf-glob filters', async () => {
    // Active facet defines subtree root 'src/**'; inactive facet denies leaf-glob '**/*.test.ts'.
    // Leaf-glob filters are handled via engine excludes (deny-list) in the CLI layer; never via anchors.
    const meta: FacetMeta = {
      core: { exclude: ['src/**'], include: ['src/README.md'] },
      tests: { exclude: ['**/*.test.ts'], include: ['src/ANCHOR.md'] },
    };
    const state: FacetState = { core: true, tests: false };
    await writeJson(sys('facet.meta.json'), meta);
    await writeJson(sys('facet.state.json'), state);
    await mkdir(path.join(cwd, 'src'), { recursive: true });
    await writeFile(path.join(cwd, 'src', 'README.md'), 'x', 'utf8');
    await writeFile(path.join(cwd, 'src', 'ANCHOR.md'), 'x', 'utf8');

    const out = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled: true,
    });
    // No scoped anchors are generated for leaf-glob patterns.
    expect(out.anchorsOverlay).not.toContain('src/**/*.test.ts');
    // Subtree excludes remain empty (no inactive subtree roots; tests facet is a filter only)
    expect(out.excludesOverlay).toEqual([]);
  });

  it('filter facets do not override structural facets', async () => {
    const meta: FacetMeta = {
      core: { exclude: ['src/**'], include: ['src/README.md'] },
      tests: { exclude: ['**/*.test.ts'], include: [] },
    };
    const state: FacetState = {
      core: false, // inactive -> would exclude 'src/**'
      tests: true, // active   -> '*.test.ts' should remain visible
    };
    await writeJson(sys('facet.meta.json'), meta);
    await writeJson(sys('facet.state.json'), state);
    // Ensure ramp-up safety is not triggered for 'core' (anchor exists under src/)
    await mkdir(path.join(cwd, 'src'), { recursive: true });
    await writeFile(path.join(cwd, 'src', 'README.md'), 'x', 'utf8');
    // The actual test files would live under src/*.test.ts; presence not required for overlay calc

    const out = await computeFacetOverlay({
      cwd,
      stanPath,
      enabled: true,
    });
    // core remains inactive; its structural subtree exclusion applies.
    expect(out.excludesOverlay).toEqual(['src/**']);
    // tests facet does not "rescue" files under structurally disabled subtrees via anchors.
    expect(out.anchorsOverlay).not.toContain('src/**/*.test.ts');
    // Anchors also include facet.state.json to preserve next-run defaults
    expect(out.anchorsOverlay).toContain('stan/system/facet.state.json');
    expect(out.anchorsOverlay).toContain('stan/system/.docs.meta.json');
    // No autosuspension expected here (core had an anchor under its excluded root)
    expect(out.autosuspended).toEqual([]);
  });
});
