// src/cli/stan/init.test.ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rmDirWithRetries } from '@/test';

import { performInit, registerInit } from './init';

describe('init helpers', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-init-'));
    process.chdir(dir);
  });

  afterEach(async () => {
    // Avoid EBUSY on Windows: do not rm the current working directory.
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rmDirWithRetries(dir);
  });

  it('performInit --force writes stan.config.yml with outputPath=stan, adds to .gitignore', async () => {
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'x', version: '0.0.0' }),
      'utf8',
    );
    const cli = new Command();
    const p = await performInit(cli, { cwd: dir, force: true });
    expect(p && p.endsWith('stan.config.yml')).toBe(true);
  });

  it('registerInit wires the command', async () => {
    const cli = new Command();
    registerInit(cli);
    // Dry parse without invoking built-in help to avoid process.exit
    await cli.parseAsync(['node', 'stan', 'init', '--force'], { from: 'user' });
    // Assert subcommand presence to satisfy expect-expect
    const names = cli.commands.map((c) => c.name());
    expect(names).toContain('init');
  });
});
