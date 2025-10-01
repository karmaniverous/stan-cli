import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findConfigPathSync, resolveStanPathSync } from '@/stan/config';

describe('config discovery and fallback stanPath', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-discover-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns null when no config exists and resolves default stanPath', async () => {
    const sub = path.join(dir, 'a', 'b');
    await mkdir(sub, { recursive: true });
    expect(findConfigPathSync(sub)).toBeNull();
    expect(resolveStanPathSync(sub)).toBe('.stan');
  });

  it('finds nearest stan.config.yml when ascending package roots', async () => {
    // Write a config at repo root
    const cfg = ['stanPath: stan', 'scripts:', '  test: npm run test'].join(
      '\n',
    );
    await writeFile(path.join(dir, 'stan.config.yml'), cfg, 'utf8');
    // Ensure a package.json so packageDirectorySync can identify the repo root
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'pkg' }),
      'utf8',
    );

    // Deep subfolder
    const deep = path.join(dir, 'packages', 'app1', 'src');
    await mkdir(deep, { recursive: true });
    const found = findConfigPathSync(deep);
    expect(
      found && found.replace(/\\/g, '/').endsWith('/stan.config.yml'),
    ).toBe(true);
  });
});
