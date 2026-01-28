/**
 * scripts/smoke-context-diff.ts
 * Robust smoke test for context mode archive composition.
 * Verifies inclusion of selected sources and external deps, and exclusion of unselected files.
 *
 * Usage:
 *   npx tsx scripts/smoke-context-diff.ts
 */
import { exec as execCb } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execCb);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'src/cli/bin/stan.ts');
const TSCONFIG = path.join(REPO_ROOT, 'tsconfig.json');
const TSX = path.join(REPO_ROOT, 'node_modules/.bin/tsx');

// Helper to run STAN CLI in the temp dir
const runStan = async (args: string, cwd: string) => {
  // Quote paths to handle spaces
  const cmd = `"${TSX}" --tsconfig "${TSCONFIG}" "${CLI_ENTRY}" ${args}`;
  // console.log(`> ${cmd}`);
  return exec(cmd, { cwd });
};

const main = async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'stan-smoke-manual-'));
  console.log(`stan: smoke test running in ${cwd}`);

  try {
    // 1. Setup Repo with external dependency structure
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

    // Sources
    const srcDir = path.join(cwd, 'src');
    await mkdir(srcDir, { recursive: true });
    // main.ts imports external dep
    await writeFile(
      path.join(srcDir, 'main.ts'),
      `import { val } from 'my-dep';\nexport const x = val;`,
      'utf8',
    );
    // ignored.ts is independent
    await writeFile(
      path.join(srcDir, 'ignored.ts'),
      `export const ignore = true;`,
      'utf8',
    );

    // Fake node_module
    const depDir = path.join(cwd, 'node_modules', 'my-dep');
    await mkdir(depDir, { recursive: true });
    await writeFile(
      path.join(depDir, 'package.json'),
      JSON.stringify({
        name: 'my-dep',
        version: '1.0.0',
        main: 'index.js',
        type: 'commonjs',
      }),
      'utf8',
    );
    await writeFile(path.join(depDir, 'index.js'), 'exports.val = 42;', 'utf8');

    // Init
    await runStan('init -f', cwd);

    // 2. Run -Scm (Meta) -> Empty baseline
    console.log('stan: [1/4] run -Scm (meta)...');
    await runStan('run -Scm', cwd);

    const outDir = path.join(cwd, '.stan/output');
    const tarPath = path.join(outDir, 'archive.tar');
    const diffPath = path.join(outDir, 'archive.diff.tar');

    // 3. Snap
    console.log('stan: [2/4] snap (baseline)...');
    await runStan('snap', cwd);

    // 4. Update state to select main.ts
    console.log('stan: [3/4] update state...');
    const statePath = path.join(cwd, '.stan/context/dependency.state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.i = ['src/main.ts'];
    await writeFile(statePath, JSON.stringify(state), 'utf8');

    // 5. Run -Sc (Full + Diff)
    console.log('stan: [4/4] run -Sc...');
    await runStan('run -Sc', cwd);

    if (!existsSync(diffPath)) throw new Error('archive.diff.tar missing');

    // 6. Verify contents
    const { stdout } = await exec(`tar -tf "${diffPath}"`, { cwd });
    const diffList = stdout.replace(/\\/g, '/'); // Normalize slashes
    const has = (p: string) => diffList.includes(p);

    if (!has('src/main.ts')) throw new Error('Missing src/main.ts in diff');
    if (!has('.stan/context/dependency.state.json'))
      throw new Error('Missing state in diff');

    // Check for staged external dep (loose version matching)
    if (!/context\/npm\/my-dep\/[^/]+\/index\.js/.test(diffList)) {
      throw new Error(`Missing staged dependency my-dep. List:\n${diffList}`);
    }

    if (has('src/ignored.ts'))
      throw new Error('Included src/ignored.ts (should be excluded)');

    console.log('stan: smoke test passed.');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
};

// Create temp dir helper
async function mkdtemp(prefix: string) {
  return import('node:fs/promises').then((m) => m.mkdtemp(prefix));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
