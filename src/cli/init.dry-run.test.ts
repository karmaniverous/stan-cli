import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerInit } from '@/cli/init';

const readUtf8 = (p: string) => readFile(p, 'utf8');

describe('init --dry-run', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-init-dry-'));
    process.chdir(dir);
  });

  afterEach(async () => {
    try {
      process.chdir(tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('does not write stan.config.yml when run with --dry-run', async () => {
    const cli = new Command();
    registerInit(cli);
    await cli.parseAsync(['node', 'stan', 'init', '--dry-run', '--force'], {
      from: 'user',
    });
    expect(existsSync(path.join(dir, 'stan.config.yml'))).toBe(false);
    // no workspace side-effects
    expect(existsSync(path.join(dir, '.stan'))).toBe(false);
  });

  it('leaves existing config unchanged under --dry-run', async () => {
    const cfgPath = path.join(dir, 'stan.config.yml');
    const yml = ['stanPath: .stan', 'scripts: {}'].join('\n');
    await writeFile(cfgPath, yml, 'utf8');

    const cli = new Command();
    registerInit(cli);
    await cli.parseAsync(['node', 'stan', 'init', '--dry-run'], {
      from: 'user',
    });

    const after = await readUtf8(cfgPath);
    expect(after).toBe(yml);
  });
});
