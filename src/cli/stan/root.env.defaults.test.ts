import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeCli } from '@/cli/stan/index';

describe('root env resolution from config opts.cliDefaults', () => {
  let dir: string;
  const envBackup = { ...process.env };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-root-env-'));
    process.chdir(dir);
    process.env = { ...envBackup };
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    try {
      process.chdir(tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('sets STAN_DEBUG/STAN_BORING and color vars from config defaults', async () => {
    const yml = [
      'stanPath: stan',
      'scripts: {}',
      'cliDefaults:',
      '  debug: true',
      '  boring: true',
    ].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');

    const cli = makeCli();
    // Use a benign subcommand to trigger preAction without heavy work
    await cli.parseAsync(['node', 'stan', 'run', '-p'], { from: 'user' });

    expect(process.env.STAN_DEBUG).toBe('1');
    expect(process.env.STAN_BORING).toBe('1');
    expect(process.env.NO_COLOR).toBe('1');
    expect(process.env.FORCE_COLOR).toBe('0');
  });

  it('negative short flags -D/-B override config defaults', async () => {
    const yml = [
      'stanPath: stan',
      'scripts: {}',
      'cliDefaults:',
      '  debug: true',
      '  boring: true',
    ].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');

    const cli = makeCli();
    await cli.parseAsync(['node', 'stan', '-D', '-B', 'run', '-p'], {
      from: 'user',
    });

    // Explicit negation disables env effects
    expect(process.env.STAN_DEBUG ?? '').not.toBe('1');
    expect(process.env.STAN_BORING ?? '').not.toBe('1');
  });
});
