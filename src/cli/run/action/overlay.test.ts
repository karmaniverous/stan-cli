import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildOverlayInputs } from './overlay';

const writeJson = async (abs: string, v: unknown) => {
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(v, null, 2), 'utf8');
};

describe('buildOverlayInputs (filter facets vs structural facets)', () => {
  it('applies leaf-glob filters only as engine excludes (never anchors)', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'stan-overlay-test-'));
    const stanPath = 'stan';
    try {
      const sys = (...parts: string[]) =>
        path.join(cwd, stanPath, 'system', ...parts);

      // Structural facet "core" (subtree) + filter facet "tests" (leaf glob).
      await writeJson(sys('facet.meta.json'), {
        core: { exclude: ['src/**'], include: ['src/README.md'] },
        tests: { exclude: ['**/*.test.ts'], include: ['src/ANCHOR.md'] },
      });

      // Ensure anchors exist so ramp-up safety doesn't autosuspend structural drops.
      await mkdir(path.join(cwd, 'src'), { recursive: true });
      await writeFile(path.join(cwd, 'src', 'README.md'), 'ok\n', 'utf8');
      await writeFile(path.join(cwd, 'src', 'ANCHOR.md'), 'ok\n', 'utf8');

      // Case A: tests facet inactive -> leaf-glob should be present in engine excludes.
      await writeJson(sys('facet.state.json'), { core: true, tests: false });
      {
        const out = await buildOverlayInputs({
          cwd,
          stanPath,
          enabled: true,
          activateNames: [],
          deactivateNames: [],
          nakedActivateAll: false,
        });
        expect(out.overlay?.anchorsOverlay ?? []).not.toContain(
          'src/**/*.test.ts',
        );
        const ex = new Set(out.engineExcludes);
        expect(ex.has('**/*.test.ts')).toBe(true);
      }

      // Case B: tests facet active -> leaf-glob should NOT be present in engine excludes.
      await writeJson(sys('facet.state.json'), { core: true, tests: true });
      {
        const out = await buildOverlayInputs({
          cwd,
          stanPath,
          enabled: true,
          activateNames: [],
          deactivateNames: [],
          nakedActivateAll: false,
        });
        expect(out.overlay?.anchorsOverlay ?? []).not.toContain(
          'src/**/*.test.ts',
        );
        const ex = new Set(out.engineExcludes);
        expect(ex.has('**/*.test.ts')).toBe(false);
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('does not allow a filter facet to rescue files inside an inactive structural subtree', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'stan-overlay-struct-'));
    const stanPath = 'stan';
    try {
      const sys = (...parts: string[]) =>
        path.join(cwd, stanPath, 'system', ...parts);

      await writeJson(sys('facet.meta.json'), {
        core: { exclude: ['src/**'], include: ['src/README.md'] },
        tests: { exclude: ['**/*.test.ts'], include: [] },
      });

      // core inactive, tests active
      await writeJson(sys('facet.state.json'), { core: false, tests: true });

      // Anchor under src/ to prevent autosuspension
      await mkdir(path.join(cwd, 'src'), { recursive: true });
      await writeFile(path.join(cwd, 'src', 'README.md'), 'ok\n', 'utf8');

      const out = await buildOverlayInputs({
        cwd,
        stanPath,
        enabled: true,
        activateNames: [],
        deactivateNames: [],
        nakedActivateAll: false,
      });

      const ex = new Set(out.engineExcludes);
      // Structural exclusion remains (engine-ready pattern)
      expect(ex.has('src/**')).toBe(true);
      // No anchor-based scoped rescue is generated
      expect(out.overlay?.anchorsOverlay ?? []).not.toContain(
        'src/**/*.test.ts',
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
