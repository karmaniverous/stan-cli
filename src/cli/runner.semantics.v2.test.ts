import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Record calls to runSelected to avoid type gymnastics and TS spread issues.
const recorded: unknown[][] = [];
vi.mock('@/runner/run', () => ({
  __esModule: true,
  runSelected: (...args: unknown[]) => {
    recorded.push(args);
    return Promise.resolve([] as string[]);
  },
}));

// CLI helpers
import { applyCliSafety } from './cli-utils';
import { registerRun } from './runner';

describe('stan run new semantics (default scripts+archive, -p/-S/-A)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-runv2-'));
    // Minimal config with two scripts
    const yml = [
      'stanPath: stan',
      'scripts:',
      '  a: node -e "process.stdout.write(`A`)"',
      '  b: node -e "process.stdout.write(`B`)"',
    ].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');
    try {
      process.chdir(dir);
    } catch {
      // ignore
    }
    // Reset recorded calls for test isolation
    recorded.length = 0;
  });

  afterEach(async () => {
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('default (no flags): runs all scripts and archives', async () => {
    const cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await cli.parseAsync(['node', 'stan', 'run'], { from: 'user' });

    expect(recorded.length).toBe(1);
    const args = recorded[0];
    // args: (cwd, config, selection, mode, behavior)
    const selection = args[2] as string[];
    const behavior = args[4] as { archive?: boolean };

    expect(selection).toEqual(['a', 'b']);
    expect(behavior.archive).toBe(true);
  });

  it('-p prints plan only and does not call runSelected', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });

    const cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await cli.parseAsync(['node', 'stan', 'run', '-p'], { from: 'user' });

    expect(logs.some((l) => /STAN run plan/i.test(l))).toBe(true);
    expect(recorded.length).toBe(0);
  });

  it('-S -A -> nothing to do; prints plan and exits', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });

    const cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await cli.parseAsync(['node', 'stan', 'run', '-S', '-A'], { from: 'user' });

    expect(logs.some((l) => /nothing to do; plan only/i.test(l))).toBe(true);
    expect(logs.some((l) => /STAN run plan/i.test(l))).toBe(true);
    expect(recorded.length).toBe(0);
  });

  it('-S conflicts with -s / -x (Commander conflictingOption)', async () => {
    const cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await expect(
      cli.parseAsync(['node', 'stan', 'run', '-S', '-s', 'a'], {
        from: 'user',
      }),
    ).rejects.toMatchObject({ code: 'commander.conflictingOption' });
  });

  it('-c conflicts with -A (Commander conflictingOption)', async () => {
    const cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await expect(
      cli.parseAsync(['node', 'stan', 'run', '-A', '-c'], { from: 'user' }),
    ).rejects.toMatchObject({ code: 'commander.conflictingOption' });
  });
});
