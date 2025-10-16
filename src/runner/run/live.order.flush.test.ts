import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerConfig } from '@/runner/run';
import { runSelected } from '@/runner/run';
import { rmDirWithRetries } from '@/test';

describe('live renderer (order + final-frame flush)', () => {
  let dir: string;
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const envBackup = { ...process.env };
  // Spy on stdout to capture log-update frames (use a minimal structural type to avoid TS signature friction)
  let writeSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-live-order-'));
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
    } catch {
      // best-effort
    }
    // BORING: ensure stable, colorless labels in assertions
    process.env.STAN_BORING = '1';
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
    await rmDirWithRetries(dir);
    vi.restoreAllMocks();
  });

  it('renders scripts first and shows archive:diff in OK state in the final frame', async () => {
    const cfg: RunnerConfig = {
      stanPath: 'stan',
      scripts: { hello: 'node -e "process.stdout.write(`Hello`)"' },
    };
    // small script so an output file exists
    await writeFile(
      path.join(dir, 'hello.js'),
      'process.stdout.write("Hello");',
      'utf8',
    );

    await runSelected(dir, cfg, ['hello'], 'concurrent', {
      archive: true,
      live: true,
    });

    // Stitch all writes into a single string for analysis
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');

    // Helper to find the last index of a regex match
    const lastIndexOfRe = (s: string, re: RegExp): number => {
      let idx = -1;
      // Ensure the regex is global when using matchAll
      const hasG = re.flags.includes('g');
      const reG = new RegExp(re.source, hasG ? re.flags : re.flags + 'g');
      for (const m of s.matchAll(reG)) {
        // m.index is defined in Node >= 12 for matchAll()
        // Fallback safety if environment differs
        idx = (m as unknown as { index?: number }).index ?? idx;
      }
      return idx;
    };

    // Row order assertion (BORING labels, table content without ANSI color)
    const idxScript = lastIndexOfRe(printed, /script\s+hello/i);
    const idxFull = lastIndexOfRe(printed, /archive\s+full/i);
    const idxDiff = lastIndexOfRe(printed, /archive\s+diff/i);

    expect(idxScript).toBeGreaterThan(-1);
    expect(idxFull).toBeGreaterThan(-1);
    expect(idxDiff).toBeGreaterThan(-1);
    // Scripts first; archives last (regardless of registration order)
    expect(idxScript).toBeLessThan(idxFull);
    expect(idxScript).toBeLessThan(idxDiff);

    // Final-frame flush assertion:
    // diff row should end in OK (BORING -> "[OK]"), not a running indicator.
    // Look for an "archive  diff" line that contains [OK] later in the buffer.
    const okDiffLineFound =
      lastIndexOfRe(printed, /archive\s+diff[^\n]*\[OK\]/i) > -1;
    expect(okDiffLineFound).toBe(true);
  });
});
