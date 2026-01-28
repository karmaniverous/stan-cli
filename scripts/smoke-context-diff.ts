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

const listTar = async (tarPath: string, cwd: string) => {
  if (!existsSync(tarPath)) return [];
  const { stdout } = await exec(`tar -tf "${tarPath}"`, { cwd });
  // Normalize to forward slashes and filter empty lines
  return stdout
    .split(/[\r\n]+/)
    .map((l) => l.trim().replace(/\\/g, '/'))
    .filter(Boolean);
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

    // Fake unused dependency
    const unusedDir = path.join(cwd, 'node_modules', 'unused-dep');
    await mkdir(unusedDir, { recursive: true });
    await writeFile(
      path.join(unusedDir, 'package.json'),
      JSON.stringify({
        name: 'unused-dep',
        version: '1.0.0',
        main: 'index.js',
      }),
      'utf8',
    );
    await writeFile(path.join(unusedDir, 'index.js'), 'exports.x = 0;', 'utf8');

    // Init
    await runStan('init -f', cwd);
    // Ensure sources exist before first run so graph is complete

    // 2. Run -Scm (Meta) -> Empty baseline
    console.log('stan: [1/4] run -Scm (meta)...');
    await runStan('run -Scm', cwd);
    const outDir = path.join(cwd, '.stan/output');
    const tarPath = path.join(outDir, 'archive.tar');
    const diffPath = path.join(outDir, 'archive.diff.tar');
    // 3. Snap
    console.log('stan: [2/4] snap (baseline)...');
    await runStan('snap', cwd);

    // Modify src/main.ts so it appears in the diff (otherwise it's baselined and excluded)
    await writeFile(
      path.join(srcDir, 'main.ts'),
      `import { val } from 'my-dep';\nexport const x = val + 1;`,
      'utf8',
    );

    // 4. Update state to select main.ts
    console.log('stan: [3/4] update state...');
    const statePath = path.join(cwd, '.stan/context/dependency.state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    // Explicitly request depth=1 so runtime deps are staged/archived.
    // Depth defaults to 0 (seed only), so a bare "src/main.ts" would not include my-dep.
    state.i = [['src/main.ts', 1]];
    await writeFile(statePath, JSON.stringify(state), 'utf8');

    // 5. Run -Sc (Full + Diff)
    console.log('stan: [4/4] run -Sc...');
    await runStan('run -Sc', cwd);

    // Print artifacts for debugging
    const metaContent = await readFile(
      path.join(cwd, '.stan/context/dependency.meta.json'),
      'utf8',
    );
    console.log('\n--- dependency.meta.json ---');
    console.log(JSON.stringify(JSON.parse(metaContent), null, 2));
    console.log('----------------------------\n');

    const stateContent = await readFile(statePath, 'utf8');
    console.log('\n--- dependency.state.json ---');
    console.log(JSON.stringify(JSON.parse(stateContent), null, 2));
    console.log('-----------------------------\n');

    // 6. Verify contents
    const fullList = await listTar(tarPath, cwd);
    const diffList = await listTar(diffPath, cwd);

    const errors: string[] = [];

    const checkFull = (list: string[]) => {
      const label = 'FULL';
      const has = (p: string) => list.includes(p);
      // Main source
      if (!has('src/main.ts')) errors.push(`${label}: missing src/main.ts`);
      // State file
      if (!has('.stan/context/dependency.state.json'))
        errors.push(`${label}: missing dependency.state.json`);
      // External dependency (loose version match)
      if (!list.some((p) => /context\/npm\/my-dep\/[^/]+\/index\.js/.test(p)))
        errors.push(`${label}: missing staged dependency my-dep`);
      // Unused dependency (should NOT be staged)
      if (list.some((p) => /context\/npm\/unused-dep/.test(p)))
        errors.push(`${label}: included unused-dep (should be excluded)`);
      // Base selection file should be present in FULL.
      if (!has('src/ignored.ts'))
        errors.push(`${label}: missing src/ignored.ts (base selection)`);
    };

    const checkDiff = (list: string[]) => {
      const label = 'DIFF';
      const has = (p: string) => list.includes(p);
      // Main source should be present because we modified it after snap.
      if (!has('src/main.ts')) errors.push(`${label}: missing src/main.ts`);
      // State file should be present because we modified it after snap.
      if (!has('.stan/context/dependency.state.json'))
        errors.push(`${label}: missing dependency.state.json`);
      // External dependency should be present because it becomes newly selected/staged.
      if (!list.some((p) => /context\/npm\/my-dep\/[^/]+\/index\.js/.test(p)))
        errors.push(`${label}: missing staged dependency my-dep`);
      // Unused dependency must not appear.
      if (list.some((p) => /context\/npm\/unused-dep/.test(p)))
        errors.push(`${label}: included unused-dep (should be excluded)`);
      // Base selection files are changed-only: do not require unchanged files in DIFF.
      if (has('src/ignored.ts'))
        errors.push(`${label}: included src/ignored.ts (should be unchanged)`);
    };

    console.log('stan: verifying FULL archive...');
    checkFull(fullList);

    console.log('stan: verifying DIFF archive...');
    checkDiff(diffList);

    if (errors.length > 0) {
      console.error('stan: verification failed.');
      console.error('FULL content:', fullList);
      console.error('DIFF content:', diffList);
      console.error('Errors:', errors);
      process.exit(1);
    }

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
