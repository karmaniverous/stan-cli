import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ContextConfig } from './config';
import { runSelected } from './run';

const read = (p: string) => readFile(p, 'utf8');

describe('script execution', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-run-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes <key>.txt for a single requested script key and captures stderr', async () => {
    const cfg: ContextConfig = {
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

  it('sequential mode: with -s preserves provided order; without -s uses config order', async () => {
    await writeFile(
      path.join(dir, 'a.js'),
      'process.stdout.write("A")',
      'utf8',
    );
    await writeFile(
      path.join(dir, 'b.js'),
      'process.stdout.write("B")',
      'utf8',
    );

    const cfg1: ContextConfig = {
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

  it('unknown key resolves with no artifacts', async () => {
    const cfg: ContextConfig = { stanPath: 'out', scripts: {} };
    const created = await runSelected(dir, cfg, ['nope']);
    expect(created).toEqual([]);
  });
});
