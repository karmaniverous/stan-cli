import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { promptForConfig } from './prompts';

// Mock inquirer to control answers returned by promptForConfig
const promptMock = vi.fn();
vi.mock('inquirer', () => ({
  __esModule: true,
  default: {
    prompt: (...args: unknown[]) => promptMock(...args),
  },
}));

describe('promptForConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-prompts-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    promptMock.mockReset();
  });

  it('selects scripts from package.json when preserveScripts is false (default)', async () => {
    const pkgScripts = { build: 'rollup -c', test: 'vitest' };
    // Answers: choose "test", set includes/excludes via CSV
    promptMock.mockResolvedValue({
      stanPath: 'stan',
      includes: 'src,docs',
      excludes: 'dist/**',
      selectedScripts: ['test'],
    });

    const out = await promptForConfig(dir, pkgScripts, undefined);
    expect(out.stanPath).toBe('stan');
    expect(out.includes).toEqual(['src', 'docs']);
    expect(out.excludes).toEqual(['dist/**']);
    expect(out.scripts).toEqual({ test: 'npm run test' });
  });

  it('preserves scripts from defaults when requested', async () => {
    const pkgScripts = { lint: 'eslint .', typecheck: 'tsc -p .' };
    const defaults = {
      stanPath: '.stan',
      includes: [],
      excludes: [],
      scripts: { build: 'npm run build', lint: 'npm run lint' },
    };
    // Answers: preserveScripts: true; no additional selection
    promptMock.mockResolvedValue({
      stanPath: 'stan',
      includes: '',
      excludes: '',
      preserveScripts: true,
      selectedScripts: [],
    });

    const out = await promptForConfig(dir, pkgScripts, defaults, true);
    expect(out.stanPath).toBe('stan'); // updated stanPath is respected
    expect(out.includes).toEqual([]);
    expect(out.excludes).toEqual([]);
    expect(out.scripts).toEqual(defaults.scripts);
  });
});
