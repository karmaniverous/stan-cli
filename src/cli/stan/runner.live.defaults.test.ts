import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Record calls to runSelected
const recorded: unknown[][] = [];
vi.mock('@/stan/run', () => ({
  __esModule: true,
  runSelected: (...args: unknown[]) => {
    recorded.push(args);
    return Promise.resolve([] as string[]);
  },
}));

import { applyCliSafety } from './cli-utils';
import { registerRun } from './runner';

describe('run live defaults and overrides', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-run-live-'));
    process.chdir(dir);
    recorded.length = 0;
    const yml = ['stanPath: stan', 'scripts:', '  a: echo a'].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');
  });

  afterEach(async () => {
    try {
      process.chdir(tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('defaults live=true when not specified', async () => {
    const cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await cli.parseAsync(['node', 'stan', 'run', '-s', 'a'], { from: 'user' });
    const behavior = (recorded[0][4] ?? {}) as { live?: boolean };
    expect(behavior.live).toBe(true);
  });

  it('cliDefaults can disable live; CLI --live re-enables', async () => {
    await writeFile(
      path.join(dir, 'stan.config.yml'),
      [
        'stanPath: stan',
        'scripts:',
        '  a: echo a',
        'cliDefaults:',
        '  run:',
        '    live: false',
      ].join('\n'),
      'utf8',
    );

    // Defaults from config -> live=false
    let cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await cli.parseAsync(['node', 'stan', 'run', '-s', 'a'], { from: 'user' });
    let behavior = (recorded.pop()?.[4] ?? {}) as { live?: boolean };
    expect(behavior.live).toBe(false);

    // CLI --live overrides default to true
    cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await cli.parseAsync(['node', 'stan', 'run', '--live', '-s', 'a'], {
      from: 'user',
    });
    behavior = (recorded.pop()?.[4] ?? {}) as { live?: boolean };
    expect(behavior.live).toBe(true);
  });

  it('parses hang thresholds from CLI', async () => {
    const cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await cli.parseAsync(
      [
        'node',
        'stan',
        'run',
        '-s',
        'a',
        '--hang-warn',
        '120',
        '--hang-kill',
        '300',
        '--hang-kill-grace',
        '10',
      ],
      { from: 'user' },
    );
    const behavior = (recorded[0][4] ?? {}) as {
      hangWarn?: number;
      hangKill?: number;
      hangKillGrace?: number;
    };
    expect(behavior.hangWarn).toBe(120);
    expect(behavior.hangKill).toBe(300);
    expect(behavior.hangKillGrace).toBe(10);
  });
});
