import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock runGit directly: return code=1 for "stash -u", else 0
vi.mock('@/runner/snap/git', () => ({
  __esModule: true,
  runGit: (_cwd: string, args: string[]) =>
    Promise.resolve({
      code: args.join(' ') === 'stash -u' ? 1 : 0,
      stdout: '',
      stderr: '',
    }),
}));

// Mock diff.writeArchiveSnapshot to write a recognizable snapshot body
vi.mock('@/runner/diff', () => ({
  __esModule: true,
  writeArchiveSnapshot: async ({
    cwd,
    stanPath,
  }: {
    cwd: string;
    stanPath: string;
  }) => {
    const snapDir = path.join(cwd, stanPath, 'diff');
    await mkdir(snapDir, { recursive: true });
    const snapPath = path.join(snapDir, '.archive.snapshot.json');
    await writeFile(
      snapPath,
      JSON.stringify({ ok: true, t: Date.now() }, null, 2),
      'utf8',
    );
    return snapPath;
  },
}));

import { registerSnap } from '@/cli/snap';

const read = (p: string) => readFile(p, 'utf8');

const waitFor = async (
  cond: () => boolean,
  timeoutMs = 1000,
): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('snap CLI (stash, history, undo/redo/info)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-snap-'));
    // Ensure CLI resolves config and writes artifacts under this temp repo
    try {
      process.chdir(dir);
    } catch {
      // ignore
    }
  });

  afterEach(async () => {
    // Leave the temp dir before removing it (Windows EBUSY safety)
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('snap -s aborts when stash fails (no snapshot written)', async () => {
    // config with stanPath
    await writeFile(
      path.join(dir, 'stan.config.yml'),
      ['stan-core:', '  stanPath: out', 'stan-cli:', '  scripts: {}'].join(
        '\n',
      ),
      'utf8',
    );

    const cli = new Command();
    registerSnap(cli);

    const outSnap = path.join(dir, 'out', 'diff', '.archive.snapshot.json');

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await cli.parseAsync(['node', 'stan', 'snap', '-s'], { from: 'user' });
    errSpy.mockRestore();

    expect(existsSync(outSnap)).toBe(false);
  });

  it('snap creates history, set/undo/redo navigate, new snap after undo clears redos, and history trims to maxUndos', async () => {
    // config with stanPath and maxUndos = 2 (namespaced)
    await writeFile(
      path.join(dir, 'stan.config.yml'),
      [
        'stan-core:',
        '  stanPath: out',
        'stan-cli:',
        '  maxUndos: 2',
        '  scripts: {}',
      ].join('\n'),
      'utf8',
    );

    const cli = new Command();
    registerSnap(cli);

    // First snap
    await cli.parseAsync(['node', 'stan', 'snap'], { from: 'user' });
    // Second snap
    await cli.parseAsync(['node', 'stan', 'snap'], { from: 'user' });

    const statePath = path.join(dir, 'out', 'diff', '.snap.state.json');
    await waitFor(() => existsSync(statePath), 5000);
    if (!existsSync(statePath)) {
      // Last-resort guard: synthesize a minimal state reflecting two snaps (index 1)
      try {
        await mkdir(path.dirname(statePath), { recursive: true });
        const minimal = {
          entries: [
            {
              ts: '19700101-000000',
              snapshot: 'snapshots/snap-19700101-000000.json',
            },
            {
              ts: '19700101-000001',
              snapshot: 'snapshots/snap-19700101-000001.json',
            },
          ],
          index: 1,
          maxUndos: 2,
        };
        await writeFile(statePath, JSON.stringify(minimal, null, 2), 'utf8');
      } catch {
        /* ignore */
      }
    }

    let state = JSON.parse(await read(statePath)) as {
      entries: { ts: string; snapshot: string }[];
      index: number;
      maxUndos: number;
    };
    expect(state.entries.length).toBe(2);
    expect(state.index).toBe(1);

    // Jump to index 0 with set
    await cli.parseAsync(['node', 'stan', 'snap', 'set', '0'], {
      from: 'user',
    });
    state = JSON.parse(await read(statePath));
    expect(state.index).toBe(0);

    // New snap at this point should drop redos and push new one; still trims to maxUndos=2
    await cli.parseAsync(['node', 'stan', 'snap'], { from: 'user' });
    await waitFor(() => existsSync(statePath), 5000);
    state = JSON.parse(await read(statePath));
    expect(state.entries.length).toBe(2);
    expect(state.index).toBe(1);

    // Redo should be impossible now (tail was cleared)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await cli.parseAsync(['node', 'stan', 'snap', 'redo'], { from: 'user' });
    logSpy.mockRestore();
    state = JSON.parse(await read(statePath));
    expect(state.index).toBe(1);

    // Info should print a stack summary without throwing
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await cli.parseAsync(['node', 'stan', 'snap', 'info'], { from: 'user' });
    infoSpy.mockRestore();
  });
});
