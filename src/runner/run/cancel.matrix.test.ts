import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RunnerConfig } from '@/runner/run';
import { rmDirWithRetries } from '@/test';
import { startRun, writeScript } from '@/test-support/run';

type Mode = 'sequential' | 'concurrent';
type CancelKind = 'keypress' | 'sigint';

const combos: Array<{
  live: boolean;
  mode: Mode;
  cancel: CancelKind;
  archive: boolean;
  label: string;
}> = [
  {
    live: true,
    mode: 'concurrent',
    cancel: 'keypress',
    archive: true,
    label: 'live concurrent keypress + archive',
  },
  {
    live: true,
    mode: 'concurrent',
    cancel: 'sigint',
    archive: true,
    label: 'live concurrent SIGINT + archive',
  },
  {
    live: false,
    mode: 'sequential',
    cancel: 'sigint',
    archive: true,
    label: 'no-live sequential SIGINT + archive',
  },
  {
    live: false,
    mode: 'sequential',
    cancel: 'sigint',
    archive: false,
    label: 'no-live sequential SIGINT + no-archive',
  },
  {
    live: true,
    mode: 'sequential',
    cancel: 'keypress',
    archive: true,
    label: 'live sequential keypress + archive',
  },
  {
    live: true,
    mode: 'sequential',
    cancel: 'sigint',
    archive: false,
    label: 'live sequential SIGINT + no-archive',
  },
];

describe('cancellation matrix (live/no-live × mode × signal × archive)', () => {
  const ttyBackup = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
  const exitBackup = process.exitCode;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-cancel-matrix-'));
  });

  afterEach(async () => {
    try {
      (process.stdout as unknown as { isTTY?: boolean }).isTTY = ttyBackup;
    } catch {
      // ignore
    }
    process.exitCode = exitBackup ?? 0;
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 25));
    await rmDirWithRetries(dir);
  });

  for (const c of combos) {
    // Keypress requires a TTY; skip invalid combos early.
    if (!c.live && c.cancel === 'keypress') continue;

    it(`${c.label}`, async () => {
      // TTY for live, non-TTY otherwise
      try {
        (process.stdout as unknown as { isTTY?: boolean }).isTTY = c.live;
      } catch {
        // ignore
      }
      // RunnerControl attaches only when BOTH stdout and stdin are TTY.
      // Ensure stdin is TTY for keypress-triggered cancellation.
      if (c.cancel === 'keypress') {
        const stdinLike = process.stdin as unknown as NodeJS.ReadStream & {
          isTTY?: boolean;
          setRawMode?: (v: boolean) => void;
        };
        stdinLike.isTTY = true;
      }

      // Minimal script set:
      // - sequential: include quick, wait, after (assert 'after' never runs)
      // - concurrent: only 'wait' (to avoid racing extra outputs)
      const cfg: RunnerConfig =
        c.mode === 'sequential'
          ? {
              stanPath: 'stan',
              scripts: {
                quick: 'node -e "process.stdout.write(`ok`)"',
                wait: 'node -e "setTimeout(()=>{}, 2000)"',
                after: 'node -e "process.stdout.write(`after`)"',
              },
            }
          : {
              stanPath: 'stan',
              scripts: {
                wait: 'node -e "setTimeout(()=>{}, 2000)"',
              },
            };

      // Provide a tiny file-backed script to ensure an output exists if needed.
      // (Concurrent path doesn't require writes; sequential asserts non-existence of 'after')
      await writeScript(dir, 'noop.js', 'process.stdout.write("NOOP")\n');

      const selection =
        c.mode === 'sequential' ? ['quick', 'wait', 'after'] : ['wait'];
      const behavior = {
        archive: c.archive,
        live: c.live,
        hangKillGrace: 1,
      } as const;

      const s = startRun({
        cwd: dir,
        config: cfg,
        selection,
        mode: c.mode,
        behavior,
      });
      // Allow the run to start
      await new Promise((r) => setTimeout(r, 200));
      // Cancel according to the chosen mechanism
      s.cancel(c.cancel);
      await s.run;

      // Archives should be absent on cancellation regardless of flag
      expect(s.paths.exists(s.paths.archiveTar)).toBe(false);
      expect(s.paths.exists(s.paths.diffTar)).toBe(false);

      // In sequential mode, 'after' must not run
      if (c.mode === 'sequential') {
        const afterOut = s.paths.outFile('after');
        expect(s.paths.exists(afterOut)).toBe(false);
      }

      // Exit code should be non-zero (best-effort signal)
      expect((process.exitCode ?? 0) !== 0).toBe(true);
    });
  }
});
