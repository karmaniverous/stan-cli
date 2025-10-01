import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContextConfig } from '@/stan/config';
import { runSelected } from '@/stan/run';

// Mock tar to keep runs light-weight
vi.mock('tar', () => ({
  __esModule: true,
  default: undefined,
  create: async ({ file }: { file: string }) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'TAR', 'utf8');
  },
}));

describe('live renderer alignment (two-space indent)', () => {
  let dir: string;
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const envBackup = { ...process.env };
  // Spy stdout writes to capture log-update frames
  let writeSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-live-align-'));
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
    } catch {
      // best-effort
    }
    process.env.STAN_BORING = '1'; // stable labels
    const stdoutLike = process.stdout as unknown as {
      write: (...args: unknown[]) => boolean;
    };
    writeSpy = vi
      .spyOn(stdoutLike, 'write')
      .mockImplementation(() => true) as unknown as {
      mockRestore: () => void;
      mock: { calls: unknown[][] };
    };
  });

  afterEach(async () => {
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = ttyBackup;
    } catch {
      // ignore
    }
    process.env = { ...envBackup };
    writeSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('indents table, summary, and hint by exactly two spaces', async () => {
    const cfg: ContextConfig = {
      stanPath: 'stan',
      scripts: { hello: 'node -e "process.stdout.write(`Hello`)"' },
    };
    await writeFile(
      path.join(dir, 'hello.js'),
      'process.stdout.write("Hello");',
      'utf8',
    );

    await runSelected(dir, cfg, ['hello'], 'concurrent', {
      archive: true,
      live: true,
    });

    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    // Look for header row with two leading spaces
    const hasTwoSpaceHeader = /(?:^|\n) {2}Type\s+Item\s+Status/m.test(printed);
    expect(hasTwoSpaceHeader).toBe(true);
    // Summary and hint lines should also be indented by two spaces
    const hasTwoSpaceSummary = /(?:^|\n) {2}\d{2}:\d{2}\s+•/m.test(printed);
    const hasTwoSpaceHint = /(?:^|\n) {2}Press q to cancel/m.test(printed);
    expect(hasTwoSpaceSummary).toBe(true);
    expect(hasTwoSpaceHint).toBe(true);
  });
});
