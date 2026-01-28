/**
 * scripts/smoke-context-diff.ts
 * Standalone smoke test for context mode archive composition.
 *
 * Usage:
 *   npx tsx scripts/smoke-context-diff.ts
 */
import { exec as execCb } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execCb);

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
    // 1. Initialize a minimal repo
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({ name: 'smoke-pkg' }),
      'utf8',
    );
    await runStan('init -f', cwd);

    // 2. Run -Scm (Meta mode)
    // Expect: archive.tar (META) created; archive.diff.tar skipped.
    console.log('stan: [1/4] run -Scm (generate meta archive)...');
    await runStan('run -Scm', cwd);

    const outDir = path.join(cwd, '.stan/output');
    const tarPath = path.join(outDir, 'archive.tar');
    const diffPath = path.join(outDir, 'archive.diff.tar');

    if (!existsSync(tarPath)) throw new Error('archive.tar missing after -Scm');
    if (existsSync(diffPath))
      throw new Error('archive.diff.tar present after -Scm (should be skipped)');

    // Verify meta content (system + dependency artifacts)
    const { stdout: metaList } = await exec(`tar -tf "${tarPath}"`, { cwd });
    if (!metaList.includes('.stan/context/dependency.meta.json'))
      throw new Error('Meta archive missing dependency.meta.json');
    if (!metaList.includes('.stan/context/dependency.state.json'))
      throw new Error('Meta archive missing dependency.state.json');

    // 3. Snap
    console.log('stan: [2/4] snap (baseline)...');
    await runStan('snap', cwd);

    // 4. Modify state and add a source file
    console.log('stan: [3/4] modify state and create file...');
    const srcDir = path.join(cwd, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, 'new.ts'), 'export const x = 1;', 'utf8');

    // Update state to include 'src/new.ts'
    const statePath = path.join(cwd, '.stan/context/dependency.state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.i = [...(state.i || []), 'src/new.ts'];
    await writeFile(statePath, JSON.stringify(state), 'utf8');

    // 5. Run -Sc (Context, non-meta)
    // Expect: archive.tar (FULL) and archive.diff.tar (DIFF) created.
    console.log('stan: [4/4] run -Sc (generate full+diff)...');
    await runStan('run -Sc', cwd);

    if (!existsSync(tarPath)) throw new Error('archive.tar missing after -Sc');
    if (!existsSync(diffPath))
      throw new Error('archive.diff.tar missing after -Sc');

    // Verify diff content
    const { stdout: diffList } = await exec(`tar -tf "${diffPath}"`, { cwd });
    if (!diffList.includes('src/new.ts'))
      throw new Error('Diff archive missing src/new.ts');
    if (!diffList.includes('.stan/context/dependency.state.json'))
      throw new Error('Diff archive missing changed dependency.state.json');

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
