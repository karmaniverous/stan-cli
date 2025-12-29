import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const writeConfig = async (dir: string): Promise<void> => {
  const yml = [
    'stan-core:',
    '  stanPath: .stan',
    '  includes: []',
    '  excludes: []',
    'stan-cli:',
    '  scripts:',
    '    test: echo test',
    '',
  ].join('\n');
  await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');
};

describe('run facet flags (Commander parsing + overlay enablement)', () => {
  it('parses -FS without bundling (-F must not consume -S)', async () => {
    vi.resetModules();

    const runSelectedMock = vi.fn(async () => []);
    vi.doMock('@/runner/run', () => ({
      __esModule: true,
      runSelected: runSelectedMock,
    }));

    vi.doMock('@/runner/system/docs-meta', () => ({
      __esModule: true,
      updateDocsMetaOverlay: vi.fn(async () => {}),
    }));

    const dir = await mkdtemp(path.join(os.tmpdir(), 'stan-facet-parse-'));
    try {
      await writeConfig(dir);
      process.chdir(dir);

      const { makeCli } = (await import('@/cli')) as { makeCli: () => any };
      const cli = makeCli();

      const logs: string[] = [];
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation((m: unknown) => logs.push(String(m)));

      // -F (no facets) + -S (no scripts) + -A (no archives) => nothing to do; must not call runSelected.
      await cli.parseAsync(['node', 'stan', 'run', '-FS', '-A'], {
        from: 'user',
      });

      logSpy.mockRestore();

      expect(runSelectedMock).toHaveBeenCalledTimes(0);
      expect(
        logs.some((l) =>
          /nothing to do; plan only \(scripts disabled, archive disabled\)/i.test(
            l,
          ),
        ),
      ).toBe(true);
    } finally {
      try {
        process.chdir(os.tmpdir());
      } catch {
        /* ignore */
      }
      await rm(dir, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('treats --no-facets as overlay OFF (options.facets=false)', async () => {
    vi.resetModules();

    const updateDocsMetaOverlayMock = vi.fn(async () => {});
    vi.doMock('@/runner/system/docs-meta', () => ({
      __esModule: true,
      updateDocsMetaOverlay: updateDocsMetaOverlayMock,
    }));

    // Ensure we never execute; -p prints plan and exits.
    vi.doMock('@/runner/run', () => ({
      __esModule: true,
      runSelected: vi.fn(async () => []),
    }));

    const dir = await mkdtemp(path.join(os.tmpdir(), 'stan-facet-nofacets-'));
    try {
      await writeConfig(dir);
      process.chdir(dir);

      const { makeCli } = (await import('@/cli')) as { makeCli: () => any };
      const cli = makeCli();

      await cli.parseAsync(['node', 'stan', 'run', '--no-facets', '-p'], {
        from: 'user',
      });

      expect(updateDocsMetaOverlayMock).toHaveBeenCalledTimes(1);
      const [[, , overlay]] = updateDocsMetaOverlayMock.mock
        .calls as unknown as [[string, string, { enabled?: boolean }]];
      expect(overlay.enabled).toBe(false);
    } finally {
      try {
        process.chdir(os.tmpdir());
      } catch {
        /* ignore */
      }
      await rm(dir, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });
});
