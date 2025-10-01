import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Spy preflightDocsAndVersion; ensure runPatch invokes it with resolved cwd
const preflightSpy = vi.fn<(cwd: string) => Promise<void>>(() =>
  Promise.resolve(),
);

vi.mock('../preflight', () => ({
  __esModule: true,
  preflightDocsAndVersion: (cwd: string) => preflightSpy(cwd),
}));

import { runPatch } from './service';

describe('runPatch preflight (docs/version) at start', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-patch-preflight-'));
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

  it('calls preflightDocsAndVersion once at start', async () => {
    // Provide a non-diff string to shortcut the pipeline; preflight should still be invoked.
    await runPatch(dir, 'NOT A DIFF');
    expect(preflightSpy).toHaveBeenCalledTimes(1);
    expect(preflightSpy).toHaveBeenCalledWith(dir);
  });
});
