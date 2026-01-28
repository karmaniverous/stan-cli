import { describe, expect, it, vi } from 'vitest';

/**
 * Pure, contract-level test (simplified after facet removal):
 * - Mock core helpers.
 * - Verify that handleSnap() calls core.writeArchiveSnapshot with correct selection.
 *
 * No filesystem side-effects; no snapshot file reads.
 */

describe('snap: snapshot baseline (pure call contract)', () => {
  it('passes engine selection into writeArchiveSnapshot', async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    const ensureOutputDirMock = vi.fn(async () => 'out');
    const loadConfigMock = vi.fn(async () => ({
      stanPath: 'out',
      includes: ['**/*.md'],
      excludes: ['CHANGELOG.md'],
    }));
    const writeSnapshotMock = vi.fn(
      async () => 'out/diff/.archive.snapshot.json',
    );

    const coreMock = {
      resolveStanPathSync: () => 'out',
      ensureOutputDir: ensureOutputDirMock,
      loadConfig: loadConfigMock,
      writeArchiveSnapshot: writeSnapshotMock,
    };

    vi.doMock('@karmaniverous/stan-core', () => ({
      __esModule: true,
      ...coreMock,
      default: coreMock,
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
    const calls = writeSnapshotMock.mock.calls as unknown as [
      [{ includes: string[]; excludes: string[]; stanPath: string }],
    ];
    const call = calls[0]?.[0];

    if (!call) throw new Error('writeArchiveSnapshot called without args');

    // includes from engine config
    expect(call.includes).toEqual(['**/*.md', 'out/imports/**']);

    // excludes = engine excludes
    const excl = new Set(call.excludes);
    expect(excl.has('CHANGELOG.md')).toBe(true);

    // stanPath resolved
    expect(call.stanPath).toBe('out');
  });
});
