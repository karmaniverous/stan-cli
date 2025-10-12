import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process spawn for stash failure in the first test
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    __esModule: true,
    ...actual,
    default: actual as unknown as object,
    spawn: (_cmd: string, args: string[]) => {
      const ee = new EventEmitter();
      // If this is 'git stash -u', simulate failure; otherwise success
      const isStash = args.join(' ') === 'stash -u';
      const code = isStash ? 1 : 0;
      setTimeout(() => ee.emit('close', code), 0);
      return ee as unknown;
    },
  };
});

// Mock diff.writeArchiveSnapshot to write a recognizable snapshot body
vi.mock('./diff', () => ({
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

import { registerSnap } from '@/cli/stan/snap';

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
      ['stanPath: out', 'scripts: {}'].join('\n'),
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
    // config with stanPath and maxUndos = 2
    await writeFile(
      path.join(dir, 'stan.config.yml'),
      ['stanPath: out', 'maxUndos: 2', 'scripts: {}'].join('\n'),
      'utf8',
    );

    const cli = new Command();
    registerSnap(cli);

    // First snap
    await cli.parseAsync(['node', 'stan', 'snap'], { from: 'user' });
    // Second snap
    await cli.parseAsync(['node', 'stan', 'snap'], { from: 'user' });

    const statePath = path.join(dir, 'out', 'diff', '.snap.state.json');
    await waitFor(() => existsSync(statePath), 3000);

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
    await waitFor(() => existsSync(statePath), 1500);
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
