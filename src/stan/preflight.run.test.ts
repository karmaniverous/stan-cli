import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock preflight to capture calls
const preflightSpy = vi.fn<(cwd: string) => Promise<void>>(() =>
  Promise.resolve(),
);
vi.mock('./preflight', () => ({
  __esModule: true,
  preflightDocsAndVersion: (cwd: string) => preflightSpy(cwd),
}));

import type { ContextConfig } from './config';
import { runSelected } from './run';

describe('preflight wiring on stan run', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-preflight-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('calls preflightDocsAndVersion at run start', async () => {
    const cfg: ContextConfig = { stanPath: 'stan', scripts: {} };
    await runSelected(dir, cfg, []);
    expect(preflightSpy).toHaveBeenCalledWith(dir);
  });
});
