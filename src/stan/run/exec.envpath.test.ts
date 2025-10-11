import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path, { delimiter } from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSelected } from '@/stan/run';

const read = (p: string) => readFile(p, 'utf8');

describe('script runner PATH augmentation (repo-local node_modules/.bin precedence)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-path-'));
    // Ensure the repo-local .bin directory exists so augmentation has an effect.
    await mkdir(path.join(dir, 'node_modules', '.bin'), { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('prefixes PATH with <repoRoot>/node_modules/.bin for child scripts', async () => {
    const cfg: ContextConfig = {
      stanPath: 'out',
      scripts: {
        // Print PATH deterministically; capture in out/output
        showpath:
          'node -e "process.stdout.write(String(process.env.PATH || process.env.Path || \'\'))"',
      },
    };
    await runSelected(dir, cfg, ['showpath'], 'concurrent', { archive: false });
    const out = path.join(dir, 'out', 'output', 'showpath.txt');
    const body = await read(out);
    const first = String(body).split(delimiter)[0] ?? '';
    expect(first.replace(/\\+/g, '/')).toBe(
      path.join(dir, 'node_modules', '.bin').replace(/\\+/g, '/'),
    );
  });

  it('still runs when .bin is absent (augmentation no-op)', async () => {
    // Remove .bin to simulate PnP/no-node_modules scenario
    await rm(path.join(dir, 'node_modules'), { recursive: true, force: true });
    const cfg: ContextConfig = {
      stanPath: 'out',
      scripts: {
        hello: 'node -e "process.stdout.write(`ok`)"',
      },
    };
    await runSelected(dir, cfg, ['hello'], 'concurrent', { archive: false });
    const out = path.join(dir, 'out', 'output', 'hello.txt');
    const body = await read(out);
    expect(body).toContain('ok');
  });
});
