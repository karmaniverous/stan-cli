import { exec as execCb } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execCb);

// Resolve absolute paths to the CLI source and runner
const CLI_ENTRY = path.resolve(__dirname, '../../cli/bin/stan.ts');
const TSX = path.resolve(__dirname, '../../../node_modules/.bin/tsx');
const TSCONFIG = path.resolve(__dirname, '../../../tsconfig.json');

const runStan = async (args: string, cwd: string) => {
  const cmd = `"${TSX}" --tsconfig "${TSCONFIG}" "${CLI_ENTRY}" ${args}`;
  return exec(cmd, { cwd });
};

const listTar = async (tarPath: string, cwd: string): Promise<string[]> => {
  const { stdout } = await exec(`tar -tf "${tarPath}"`, { cwd });
  return stdout
    .split(/[\r\n]+/)
    .map((l) => l.trim().replace(/\\/g, '/'))
    .filter(Boolean);
};

describe('smoke: context mode respects dependency.state.json for staging', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'stan-smoke-ctx-select-'));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true }).catch(() => void 0);
  });

  it('stages only deps reachable from state seeds (does not stage unselected graph deps)', async () => {
    // Minimal TS setup so the dependency graph can resolve TS imports + node_modules.
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({ name: 'smoke-pkg', type: 'module' }),
      'utf8',
    );
    await writeFile(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
          allowJs: true,
          rootDir: '.',
        },
      }),
      'utf8',
    );

    // Sources: both are in base selection; only main.ts is selected in state.
    await writeFile(
      path.join(cwd, 'src', 'main.ts'),
      `import { val } from 'my-dep';\nexport const x = val;\n`,
      'utf8',
    );
    await writeFile(
      path.join(cwd, 'src', 'ignored.ts'),
      `import { x } from 'unused-dep';\nexport const ignore = x;\n`,
      'utf8',
    );

    // Two external deps; only my-dep should be staged once state selects src/main.ts.
    await writeFile(
      path.join(cwd, 'node_modules', 'my-dep', 'package.json'),
      JSON.stringify({
        name: 'my-dep',
        version: '1.0.0',
        main: 'index.js',
        type: 'commonjs',
      }),
      'utf8',
    );
    await writeFile(
      path.join(cwd, 'node_modules', 'my-dep', 'index.js'),
      'exports.val = 42;',
      'utf8',
    );
    await writeFile(
      path.join(cwd, 'node_modules', 'unused-dep', 'package.json'),
      JSON.stringify({
        name: 'unused-dep',
        version: '0.0.1',
        main: 'index.js',
        type: 'commonjs',
      }),
      'utf8',
    );
    await writeFile(
      path.join(cwd, 'node_modules', 'unused-dep', 'index.js'),
      'exports.x = 0;',
      'utf8',
    );

    // Init STAN (creates config + workspace)
    await runStan('init -f', cwd);

    // Meta run to establish dependency artifacts
    await runStan('run -Scm', cwd);

    // Baseline snapshot
    await runStan('snap', cwd);

    // Select only src/main.ts with depth=1 so its external runtime dep is staged.
    const statePath = path.join(
      cwd,
      '.stan',
      'context',
      'dependency.state.json',
    );
    const state = JSON.parse(await readFile(statePath, 'utf8')) as {
      v: number;
      i: unknown[];
      x?: unknown[];
    };
    state.i = [['src/main.ts', 1]];
    await writeFile(statePath, JSON.stringify(state), 'utf8');

    // Context run (full + diff)
    await runStan('run -Sc', cwd);

    const outDir = path.join(cwd, '.stan', 'output');
    const fullTar = path.join(outDir, 'archive.tar');
    const diffTar = path.join(outDir, 'archive.diff.tar');

    const [full, diff] = await Promise.all([
      listTar(fullTar, cwd),
      listTar(diffTar, cwd),
    ]);

    // my-dep should be staged (selected via state closure)
    expect(
      full.some((p) => /\/context\/npm\/my-dep\/[^/]+\/index\.js$/.test(p)),
    ).toBe(true);
    expect(
      diff.some((p) => /\/context\/npm\/my-dep\/[^/]+\/index\.js$/.test(p)),
    ).toBe(true);

    // unused-dep must NOT be staged (reachable only from src/ignored.ts, which is not a state seed)
    expect(full.some((p) => /\/context\/npm\/unused-dep\//.test(p))).toBe(
      false,
    );
    expect(diff.some((p) => /\/context\/npm\/unused-dep\//.test(p))).toBe(
      false,
    );
  });
});
