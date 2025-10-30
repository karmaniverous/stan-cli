import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyCliSafety } from '@/cli/cli-utils';

// Capture runSelected invocations without executing scripts
const recorded: unknown[][] = [];
vi.mock('@/runner/run', () => ({
  __esModule: true,
  runSelected: (...args: unknown[]) => {
    recorded.push(args);
    return Promise.resolve([] as string[]);
  },
}));

import { registerRun } from '@/cli/runner';

describe('overlay excludes mapping (subtree roots expanded; leaf-globs propagated)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-overlay-map-'));
    process.chdir(dir);
    recorded.length = 0;
    // Minimal CLI config with facets default enabled
    await writeFile(
      path.join(dir, 'stan.config.yml'),
      [
        'stanPath: stan',
        'scripts:',
        '  a: echo a',
        'cliDefaults:',
        '  run:',
        '    facets: true',
      ].join('\n'),
      'utf8',
    );

    // facet meta/state under <stanPath>/system
    const sys = (...parts: string[]) =>
      path.join(dir, 'stan', 'system', ...parts);
    await mkdir(path.dirname(sys('facet.meta.json')), { recursive: true });
    // Two facets:
    // - docs: subtree root exclude (docs/**) with an anchor to avoid autosuspend
    // - tests: leaf-glob exclude (**/*.test.ts) with an anchor under src to scope re-inclusions
    await writeFile(
      sys('facet.meta.json'),
      JSON.stringify(
        {
          docs: { exclude: ['docs/**'], include: ['docs/KEEP.md'] },
          tests: { exclude: ['**/*.test.ts'], include: ['src/ANCHOR.md'] },
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(
      sys('facet.state.json'),
      JSON.stringify({ docs: false, tests: false }, null, 2),
      'utf8',
    );
    // materialize anchors
    await mkdir(path.join(dir, 'docs'), { recursive: true });
    await writeFile(path.join(dir, 'docs', 'KEEP.md'), 'x', 'utf8');
    await mkdir(path.join(dir, 'src'), { recursive: true });
    await writeFile(path.join(dir, 'src', 'ANCHOR.md'), 'x', 'utf8');
  });

  afterEach(() => {
    try {
      process.chdir(tmpdir());
    } catch {
      /* ignore */
    }
    vi.restoreAllMocks();
  });

  it('expands subtree roots and propagates leaf-glob excludes into runnerConfig', async () => {
    const cli = new Command();
    applyCliSafety(cli);
    registerRun(cli);
    await cli.parseAsync(['node', 'stan', 'run', '-s', 'a'], { from: 'user' });
    expect(recorded.length).toBe(1);
    const args = recorded[0];
    // args: (cwd, config, selection, mode, behavior, promptChoice?)
    const runnerCfg = (args[1] ?? {}) as {
      excludes?: string[];
    };
    const excludes = (runnerCfg.excludes ?? []).map((s) =>
      s.replace(/\\+/g, '/'),
    );
    // Subtree root 'docs' must be expanded to 'docs/**'
    expect(excludes).toContain('docs/**');
    // Leaf-glob from inactive facet must pass through unchanged
    expect(excludes).toContain('**/*.test.ts');
  });
});
