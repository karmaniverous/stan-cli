import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerConfig } from '@/runner/run';
import { runSelected } from '@/runner/run';
import { stripAnsi } from '@/runner/run/live';

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

  it('renders with a leading blank line and flush-left alignment (no global indent)', async () => {
    const cfg: RunnerConfig = {
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

    const printedRaw = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    // Remove ANSI/control sequences for layout assertions
    const printed = stripAnsi(printedRaw);
    // Leading blank line separates from the prior shell prompt
    expect(printed.startsWith('\n')).toBe(true); // Header row is flush-left (no two-space indent)
    const hasHeader = /(?:^|\n)Type\s+Item\s+Status/m.test(printed);
    expect(hasHeader).toBe(true);
    // Summary and hint are also flush-left
    const hasSummary = /(?:^|\n)\d{2}:\d{2}\s+•/m.test(printed);
    const hasHint = /(?:^|\n)Press q to cancel/m.test(printed);
    expect(hasSummary).toBe(true);
    expect(hasHint).toBe(true);
  });
});
