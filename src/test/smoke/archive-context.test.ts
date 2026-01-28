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

// Helper to run the CLI in the temp dir
const runStan = async (args: string, cwd: string) => {
  // Quote paths to handle potential spaces
  const cmd = `"${TSX}" "${CLI_ENTRY}" ${args}`;
  return exec(cmd, { cwd });
};

describe('smoke: archive context composition (meta/diff)', () => {
  let cwd: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test run
    cwd = await mkdtemp(path.join(tmpdir(), 'stan-smoke-'));
  });

  afterEach(async () => {
    // Cleanup best-effort
    await rm(cwd, { recursive: true, force: true }).catch(() => void 0);
  });

  it('includes dependency state in diffs when context mode is active', async () => {
    // 1. Initialize a minimal repo
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({ name: 'smoke-pkg' }),
    );
    await runStan('init -f', cwd);

    // 2. Run -Scm (Meta)
    // -S: no scripts
    // -c: context mode (initializes dependency artifacts)
    // -m: meta archive (writes archive.tar as meta; skips diff)
    // This should create .stan/context/dependency.state.json if missing.
    await runStan('run -Scm', cwd);

    // Validate meta archive exists
    const tarPath = path.join(cwd, '.stan/output/archive.tar');
    const tarStats = await readFile(tarPath);
    expect(tarStats.length).toBeGreaterThan(0);

    // 3. Simulate patch to dependency state
    const statePath = path.join(cwd, '.stan/context/dependency.state.json');
    // Read the file created by the previous run
    const stateContent = JSON.parse(await readFile(statePath, 'utf8')) as {
      i?: string[];
    };
    // Modify it
    stateContent.i = ['added-node'];
    await writeFile(statePath, JSON.stringify(stateContent), 'utf8');

    // 4. Run -Sc (Context, no meta) -> Diff
    // Option B: Should create BOTH archive.tar (FULL) and archive.diff.tar.
    await runStan('run -Sc', cwd);

    // Validate FULL archive exists
    const fullTarStats = await readFile(
      path.join(cwd, '.stan/output/archive.tar'),
    );
    expect(fullTarStats.length).toBeGreaterThan(0);

    // 5. Validate diff archive contains the state file
    const diffTarPath = path.join(cwd, '.stan/output/archive.diff.tar');
    // Use system tar to list contents (standard in CI/Mac/Linux)
    const { stdout } = await exec(`tar -tf "${diffTarPath}"`, { cwd });

    expect(stdout).toContain('.stan/context/dependency.state.json');
  });
});
