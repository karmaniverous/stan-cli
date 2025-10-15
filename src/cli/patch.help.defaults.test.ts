import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerPatch } from './patch';

describe('patch help shows default file from cliDefaults.patch.file', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-patch-help-'));
    process.chdir(dir);
    await writeFile(
      path.join(dir, 'stan.config.yml'),
      [
        'stanPath: .stan',
        'scripts: {}',
        'cliDefaults:',
        '  patch:',
        '    file: .stan/patch/last.patch',
      ].join('\n'),
      'utf8',
    );
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
  it('prints (DEFAULT: <path>) in -f option description', () => {
    const cli = new Command();
    registerPatch(cli);
    const sub = cli.commands.find((c) => c.name() === 'patch')!;
    const out = sub.helpInformation();
    // Help lines may wrap; allow newlines between DEFAULT: and the path.
    expect(out).toMatch(
      /-f,\s*--file[\s\S]*DEFAULT:\s*\.stan\/patch\/last\.patch/i,
    );
  });
});
