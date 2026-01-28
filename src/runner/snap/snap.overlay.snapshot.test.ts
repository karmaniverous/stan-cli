import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pure, contract-level test (simplified after facet removal):
 * - Mock core helpers.
 * - Verify that handleSnap() calls core.writeArchiveSnapshot with correct selection.
 *
 * No filesystem side-effects; no snapshot file reads.
 */

// Hoist mock functions so they can be used in vi.mock factory
const { ensureOutputDirMock, loadConfigMock, writeSnapshotMock } = vi.hoisted(
  () => {
    const ensure = vi.fn(async () => {
      await Promise.resolve();
      return 'out';
    });
    const load = vi.fn(async () => {
      await Promise.resolve();
      return {
        stanPath: 'out',
        includes: ['**/*.md'],
        excludes: ['CHANGELOG.md'],
      };
    });
    const write = vi.fn(async () => {
      await Promise.resolve();
      return 'out/diff/.archive.snapshot.json';
    });
    return {
      ensureOutputDirMock: ensure,
      loadConfigMock: load,
      writeSnapshotMock: write,
    };
  },
);

// Mock core globally for this test file (hoisted)
vi.mock('@karmaniverous/stan-core', () => {
  const coreMock = {
    resolveStanPathSync: () => 'out',
    ensureOutputDir: ensureOutputDirMock,
    loadConfig: loadConfigMock,
    writeArchiveSnapshot: writeSnapshotMock,
  };
  return {
    __esModule: true,
    ...coreMock,
    default: coreMock,
  };
});

describe('snap: snapshot baseline (pure call contract)', () => {
  it('passes engine selection into writeArchiveSnapshot', async () => {
    // Reset mocks to ensure clean call counts
    ensureOutputDirMock.mockClear();
    writeSnapshotMock.mockClear();

    // Mock run defaults
    vi.mock('@/cli/run/derive/run-defaults', () => ({
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
    const calls = writeSnapshotMock.mock.calls;
    const firstCall = calls[0] as [
      { includes: string[]; excludes: string[]; stanPath: string },
    ];
    const call = firstCall[0];

    // includes from engine config
    expect(call.includes).toEqual(['**/*.md', 'out/imports/**']);

    // excludes = engine excludes
    const excl = new Set(call.excludes ?? []);
    expect(excl.has('CHANGELOG.md')).toBe(true);

    // stanPath resolved
    expect(call.stanPath).toBe('out');
  });
});
