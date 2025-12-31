import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pure, contract-level test:
 * - Mock core and overlay/default helpers.
 * - Verify that handleSnap() calls core.writeArchiveSnapshot with:
 *     includes = engine includes,
 *     excludes = engine excludes ∪ overlay excludesOverlay,
 *     anchors  = overlay anchorsOverlay.
 *
 * No filesystem side-effects; no snapshot file reads.
 */

describe('snap: overlay-aware snapshot baseline (pure call contract)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('passes overlay excludes/anchors together with engine selection into writeArchiveSnapshot', async () => {
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
      anchors?: string[];
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

    // Mock overlay: enabled=true; one subtree root + one anchor
    const ov = {
      enabled: true,
      excludesOverlay: ['docs/**'],
      anchorsOverlay: ['docs/README.md'],
      effective: {},
      autosuspended: [],
      anchorsKeptCounts: {},
      overlapKeptCounts: {},
    };
    vi.doMock('@/runner/overlay/facets', () => ({
      __esModule: true,
      computeFacetOverlay: vi.fn(async () => {
        await Promise.resolve(); // satisfy require-await
        return ov;
      }),
    }));

    // Mock run defaults: overlay enabled by default
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
          facets: true,
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

    // excludes = engine excludes ∪ overlay excludes
    const excl = new Set(call.excludes ?? []);
    expect(excl.has('CHANGELOG.md')).toBe(true);
    expect(excl.has('docs/**')).toBe(true);

    // anchors = overlay anchors
    expect(call.anchors).toEqual(['docs/README.md']);

    // stanPath resolved
    expect(call.stanPath).toBe('out');
  });
});
