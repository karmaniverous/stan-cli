import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Spy preflightDocsAndVersion; ensure handleSnap invokes it with resolved cwd
const preflightSpy = vi.fn<(cwd: string) => Promise<void>>(() =>
  Promise.resolve(),
);

vi.mock('../preflight', () => ({
  __esModule: true,
  preflightDocsAndVersion: (cwd: string) => preflightSpy(cwd),
}));

import { handleSnap } from './snap-run';

describe('preflight wiring on stan snap', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-preflight-snap-'));
    try {
      process.chdir(dir);
    } catch {
      // ignore
    }
    preflightSpy.mockClear();
  });

  afterEach(async () => {
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('calls preflightDocsAndVersion at snap start', async () => {
    await handleSnap();
    expect(preflightSpy).toHaveBeenCalledTimes(1);
    expect(preflightSpy).toHaveBeenCalledWith(dir);
  });
});
