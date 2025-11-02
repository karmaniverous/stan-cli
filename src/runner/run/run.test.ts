import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RunnerConfig } from '@/runner/run';
import { runSelected } from '@/runner/run';
import { rmDirWithRetries } from '@/test';
import { writeScript } from '@/test-support/run';

const read = (p: string) => readFile(p, 'utf8');

describe('script execution', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-run-'));
  });

  afterEach(async () => {
    await rmDirWithRetries(dir);
  });

  it.skip('writes <key>.txt for a single requested script key and captures stderr', async () => {
    const cfg: RunnerConfig = {
      stanPath: 'out',
      scripts: {
        hello: 'node -e "console.error(123);process.stdout.write(`ok`)"',
      },
    };
    await runSelected(dir, cfg, ['hello']);
    const out = path.join(dir, 'out', 'output', 'hello.txt');
    expect(existsSync(out)).toBe(true);
    const body = await read(out);
    expect(body.includes('ok')).toBe(true);
    expect(body.includes('123')).toBe(true);
  });

  it.skip('sequential mode: with -s preserves provided order; without -s uses config order', async () => {
    await writeScript(dir, 'a.js', 'process.stdout.write("A")\n');
    await writeScript(dir, 'b.js', 'process.stdout.write("B")\n');

    const cfg1: RunnerConfig = {
      stanPath: 'out',
      scripts: { a: 'node a.js', b: 'node b.js' },
    };

    await runSelected(dir, cfg1, ['b', 'a'], 'sequential');
    const order1 = await read(path.join(dir, 'out', 'output', 'order.txt'));
    expect(order1).toBe('BA');

    // config order when not enumerated
    await runSelected(dir, cfg1, null, 'sequential');
    const order2 = await read(path.join(dir, 'out', 'output', 'order.txt'));
    expect(order2).toBe('AB');
  });

  it.skip('unknown key resolves with no artifacts', async () => {
    const cfg: RunnerConfig = { stanPath: 'out', scripts: {} };
    const created = await runSelected(dir, cfg, ['nope']);
    expect(created).toEqual([]);
  });
});
