import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Record calls to runSelected so assertions can inspect selection/behavior.
const recorded: unknown[][] = [];
vi.mock('@/runner/run', () => ({
  __esModule: true,
  runSelected: (...args: unknown[]) => {
    recorded.push(args);
    return Promise.resolve([] as string[]);
  },
}));

import { registerRun } from '@/cli/runner';

// Local, SSR/mocks‑robust safety adapter (avoids brittle import shapes)
function applySafetyLocal(cmd: Command): void {
  try {
    cmd.exitOverride((err) => {
      const swallow = new Set<string>([
        'commander.helpDisplayed',
        'commander.unknownCommand',
        'commander.unknownOption',
        'commander.help',
        'commander.excessArguments',
      ]);
      if (swallow.has(err.code)) return;
      throw err;
    });
  } catch {
    // best‑effort
  }
  // Normalize test argv like ["node","stan", ...] -> [...]
  type FromOpt = { from?: 'user' | 'node' };
  const holder = cmd as unknown as {
    parse: (argv?: readonly string[], opts?: FromOpt) => Command;
    parseAsync: (argv?: readonly string[], opts?: FromOpt) => Promise<Command>;
  };
  const origParse = holder.parse.bind(cmd);
  const origParseAsync = holder.parseAsync.bind(cmd);
  // Safer normalization aligned with snap/safety helper: accept unknown[].
  const normalizeArgv = (
    argv?: readonly unknown[],
  ): readonly string[] | undefined => {
    if (!Array.isArray(argv)) return undefined;
    if (argv.length >= 2 && argv[0] === 'node' && argv[1] === 'stan') {
      const rest = argv
        .slice(2)
        .filter((t): t is string => typeof t === 'string');
      return rest as readonly string[];
    }
    return argv.every((t) => typeof t === 'string')
      ? (argv as readonly string[])
      : undefined;
  };
  try {
    holder.parse = (argv?: readonly string[], opts?: FromOpt) => {
      const norm = normalizeArgv(argv as unknown);
      // Commander tolerates undefined argv
      origParse(norm, opts);
      return cmd;
    };
    holder.parseAsync = async (argv?: readonly string[], opts?: FromOpt) => {
      const norm = normalizeArgv(argv as unknown);
      await origParseAsync(norm, opts);
      return cmd;
    };
  } catch {
    // best‑effort
  }
}

describe('run defaults from opts.cliDefaults.run', () => {
  let dir: string;

  const writeCfg = async (yml: string) => {
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-run-defaults-'));
    try {
      process.chdir(dir);
    } catch {
      // ignore
    }
    recorded.length = 0;
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

  it('defaults to all scripts when run.scripts=true', async () => {
    await writeCfg(
      [
        'stanPath: stan',
        'scripts:',
        '  a: echo a',
        '  b: echo b',
        'cliDefaults:',
        '  run:',
        '    scripts: true',
      ].join('\n'),
    );

    const cli = new Command();
    applySafetyLocal(cli);
    registerRun(cli);

    // Execute so runSelected is invoked and selection is captured.
    await cli.parseAsync(['node', 'stan', 'run'], { from: 'user' });

    const sel = ((recorded[0] ?? [])[2] ?? []) as string[];
    expect(Array.isArray(sel)).toBe(true);
    expect(sel).toEqual(expect.arrayContaining(['a', 'b']));
    expect(sel.length).toBe(2);
  });

  it('defaults to [] when run.scripts=false and archive=false from defaults', async () => {
    await writeCfg(
      [
        'stanPath: stan',
        'scripts:',
        '  a: echo a',
        '  b: echo b',
        'cliDefaults:',
        '  run:',
        '    scripts: false',
        '    archive: false',
      ].join('\n'),
    );

    const cli = new Command();
    applySafetyLocal(cli);
    registerRun(cli);

    // With scripts=false and archive=false defaults, the CLI prints a plan‑only notice
    // and should not invoke runSelected at all.
    await cli.parseAsync(['node', 'stan', 'run'], { from: 'user' });

    expect(recorded.length).toBe(0);
  });

  it('defaults to intersection when run.scripts=["b"]', async () => {
    await writeCfg(
      [
        'stanPath: stan',
        'scripts:',
        '  a: echo a',
        '  b: echo b',
        'cliDefaults:',
        '  run:',
        '    scripts:',
        '      - b',
      ].join('\n'),
    );

    const cli = new Command();
    applySafetyLocal(cli);
    registerRun(cli);

    await cli.parseAsync(['node', 'stan', 'run'], { from: 'user' });

    const sel = ((recorded[0] ?? [])[2] ?? []) as string[];
    expect(sel).toEqual(['b']);
  });

  it('defaults hang thresholds to built-ins when not specified in CLI/config', async () => {
    await writeCfg(
      [
        'stanPath: stan',
        'scripts:',
        '  a: echo a',
        // no cliDefaults.run.hang* set here -> built-ins apply
      ].join('\n'),
    );

    const cli = new Command();
    applySafetyLocal(cli);
    registerRun(cli);

    await cli.parseAsync(['node', 'stan', 'run', '-s', 'a'], { from: 'user' });

    const behavior = ((recorded[0] ?? [])[4] ?? {}) as {
      hangWarn?: number;
      hangKill?: number;
      hangKillGrace?: number;
    };
    expect(behavior.hangWarn).toBe(120);
    expect(behavior.hangKill).toBe(300);
    expect(behavior.hangKillGrace).toBe(10);
  });
});
