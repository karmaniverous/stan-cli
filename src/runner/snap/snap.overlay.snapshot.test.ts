import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pure, contract-level test (simplified after facet removal):
 * - Mock core helpers.
 * - Verify that handleSnap() calls core.writeArchiveSnapshot with correct selection.
 *
 * No filesystem side-effects; no snapshot file reads.
 */

describe('snap: snapshot baseline (pure call contract)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('passes engine selection into writeArchiveSnapshot', async () => {
    // Arrange mocks (capture fn refs for assertions)
    const ensureOutputDirMock = vi.fn(async () => {
      // satisfy require-await without behavior changes
      await Promise.resolve();
      return 'out';
    });

    const loadConfigMock = vi.fn(async () => {
      await Promise.resolve(); // satisfy require-await
      return {
        stanPath: 'out',
        includes: ['**/*.md'],
        excludes: ['CHANGELOG.md'],
      };
    });

    type SnapshotArgs = {
      cwd: string;
      stanPath: string;
      includes?: string[];
      excludes?: string[];
    };

    const writeSnapshotMock = vi.fn(async (_args: SnapshotArgs) => {
      await Promise.resolve(); // satisfy require-await
      return 'out/diff/.archive.snapshot.json';
    });

    // Mock core (static import in module + dynamic import inside handleSnap)
    vi.doMock('@karmaniverous/stan-core', () => ({
      __esModule: true,
      resolveStanPathSync: () => 'out',
      ensureOutputDir: ensureOutputDirMock,
      loadConfig: loadConfigMock,
      writeArchiveSnapshot: writeSnapshotMock,
    }));

    // Mock run defaults
    vi.doMock('@/cli/run/derive/run-defaults', () => ({
      __esModule: true,
      getRunDefaults: () =>
        ({
          archive: true,
          combine: false,
          plan: true,
          keep: false,
          sequential: false,
          live: true,
          hangWarn: 120,
          hangKill: 300,
          hangKillGrace: 10,
          prompt: 'auto',
          context: false,
        }) as const,
    }));

    // Import SUT after mocks are in place
    const mod = (await import('@/runner/snap')) as {
      handleSnap: (opts?: { stash?: boolean }) => Promise<void>;
    };

    // Act
    await mod.handleSnap();

    // Assert: ensureOutputDir called
    expect(ensureOutputDirMock).toHaveBeenCalledTimes(1);

    // Assert: writeArchiveSnapshot invoked with merged selection + anchors
    expect(writeSnapshotMock).toHaveBeenCalledTimes(1);
    // Safely destructure first call (Args is a single-arg tuple)
    const [[call]] = writeSnapshotMock.mock.calls;

    // includes from engine config
    expect(call.includes).toEqual(['**/*.md', 'out/imports/**']);

    // excludes = engine excludes
    const excl = new Set(call.excludes ?? []);
    expect(excl.has('CHANGELOG.md')).toBe(true);

    // stanPath resolved
    expect(call.stanPath).toBe('out');
  });
});
