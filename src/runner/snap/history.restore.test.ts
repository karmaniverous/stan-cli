import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rmDirWithRetries } from '@/test';

const writeUtf8 = (abs: string, body: string) => writeFile(abs, body, 'utf8');
const readUtf8 = (abs: string) => readFile(abs, 'utf8');

describe('snap history: undo/set restore snapshot baseline', () => {
  let dir: string;

  const loadHandlers = async (): Promise<{
    handleUndo: () => Promise<void>;
    handleSet: (indexArg: string) => Promise<void>;
  }> => {
    vi.resetModules();
    vi.unmock('@karmaniverous/stan-core');
    const mod = (await import('./history')) as unknown as {
      handleUndo: () => Promise<void>;
      handleSet: (indexArg: string) => Promise<void>;
    };
    return { handleUndo: mod.handleUndo, handleSet: mod.handleSet };
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-snap-history-'));
  });

  afterEach(async () => {
    try {
      process.chdir(os.tmpdir());
    } catch {
      /* ignore */
    }
    await rmDirWithRetries(dir);
    vi.restoreAllMocks();
  });

  it('handleUndo restores <stanPath>/diff/.archive.snapshot.json (repo root)', async () => {
    // Arrange: minimal namespaced config at repo root
    await writeUtf8(
      path.join(dir, 'stan.config.yml'),
      [
        'stan-core:',
        '  stanPath: .stan',
        'stan-cli:',
        '  scripts: {}',
        '',
      ].join('\n'),
    );
    const diffDir = path.join(dir, '.stan', 'diff');
    const snapsDir = path.join(diffDir, 'snapshots');
    await mkdir(snapsDir, { recursive: true });

    const snap0 = JSON.stringify({ snap: 0 }, null, 2) + '\n';
    const snap1 = JSON.stringify({ snap: 1 }, null, 2) + '\n';
    await writeUtf8(path.join(snapsDir, 'snap-0.json'), snap0);
    await writeUtf8(path.join(snapsDir, 'snap-1.json'), snap1);

    // Active baseline initially matches snap-1
    await writeUtf8(path.join(diffDir, '.archive.snapshot.json'), snap1);

    // History points at index 1 (snap-1)
    await writeUtf8(
      path.join(diffDir, '.snap.state.json'),
      JSON.stringify(
        {
          entries: [
            { ts: 't0', snapshot: 'snapshots/snap-0.json' },
            { ts: 't1', snapshot: 'snapshots/snap-1.json' },
          ],
          index: 1,
          maxUndos: 10,
        },
        null,
        2,
      ) + '\n',
    );

    // Act
    process.chdir(dir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { handleUndo } = await loadHandlers();
    await handleUndo();

    // Assert: index moved to 0 and baseline restored to snap-0
    const state = JSON.parse(
      await readUtf8(path.join(diffDir, '.snap.state.json')),
    ) as { index: number };
    expect(state.index).toBe(0);

    const baseline = await readUtf8(
      path.join(diffDir, '.archive.snapshot.json'),
    );
    expect(baseline).toBe(snap0);
  });

  it('works from a subdirectory (resolves repo root via config)', async () => {
    await writeUtf8(
      path.join(dir, 'stan.config.yml'),
      [
        'stan-core:',
        '  stanPath: .stan',
        'stan-cli:',
        '  scripts: {}',
        '',
      ].join('\n'),
    );
    const diffDir = path.join(dir, '.stan', 'diff');
    const snapsDir = path.join(diffDir, 'snapshots');
    await mkdir(snapsDir, { recursive: true });

    const snap0 = JSON.stringify({ snap: 0 }, null, 2) + '\n';
    const snap1 = JSON.stringify({ snap: 1 }, null, 2) + '\n';
    await writeUtf8(path.join(snapsDir, 'snap-0.json'), snap0);
    await writeUtf8(path.join(snapsDir, 'snap-1.json'), snap1);
    await writeUtf8(path.join(diffDir, '.archive.snapshot.json'), snap1);
    await writeUtf8(
      path.join(diffDir, '.snap.state.json'),
      JSON.stringify(
        {
          entries: [
            { ts: 't0', snapshot: 'snapshots/snap-0.json' },
            { ts: 't1', snapshot: 'snapshots/snap-1.json' },
          ],
          index: 1,
          maxUndos: 10,
        },
        null,
        2,
      ) + '\n',
    );

    const sub = path.join(dir, 'subdir');
    await mkdir(sub, { recursive: true });

    process.chdir(sub);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { handleUndo } = await loadHandlers();
    await handleUndo();

    const baseline = await readUtf8(
      path.join(diffDir, '.archive.snapshot.json'),
    );
    expect(baseline).toBe(snap0);
  });

  it('handleSet restores baseline to the selected index', async () => {
    await writeUtf8(
      path.join(dir, 'stan.config.yml'),
      [
        'stan-core:',
        '  stanPath: .stan',
        'stan-cli:',
        '  scripts: {}',
        '',
      ].join('\n'),
    );
    const diffDir = path.join(dir, '.stan', 'diff');
    const snapsDir = path.join(diffDir, 'snapshots');
    await mkdir(snapsDir, { recursive: true });

    const snap0 = JSON.stringify({ snap: 0 }, null, 2) + '\n';
    const snap1 = JSON.stringify({ snap: 1 }, null, 2) + '\n';
    await writeUtf8(path.join(snapsDir, 'snap-0.json'), snap0);
    await writeUtf8(path.join(snapsDir, 'snap-1.json'), snap1);
    await writeUtf8(path.join(diffDir, '.archive.snapshot.json'), snap0);
    await writeUtf8(
      path.join(diffDir, '.snap.state.json'),
      JSON.stringify(
        {
          entries: [
            { ts: 't0', snapshot: 'snapshots/snap-0.json' },
            { ts: 't1', snapshot: 'snapshots/snap-1.json' },
          ],
          index: 0,
          maxUndos: 10,
        },
        null,
        2,
      ) + '\n',
    );

    process.chdir(dir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { handleSet } = await loadHandlers();
    await handleSet('1');

    const baseline = await readUtf8(
      path.join(diffDir, '.archive.snapshot.json'),
    );
    expect(baseline).toBe(snap1);
  });
});
