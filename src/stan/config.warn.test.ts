import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '@/stan/config';

describe('config schema (scripts union + warnPattern validation)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-cfg-warn-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('accepts scripts as string and as object with warnPattern', async () => {
    const yml = [
      'stanPath: out',
      'scripts:',
      '  a: echo a',
      '  b:',
      '    script: echo b',
      '    warnPattern: "\\\\bWARN\\\\b"',
    ].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');
    const cfg = await loadConfig(dir);
    expect(typeof cfg.scripts.a === 'string').toBe(true);
    expect(typeof cfg.scripts.b === 'object').toBe(true);
  });

  it('rejects invalid warnPattern with a friendly error', async () => {
    const yml = [
      'stanPath: out',
      'scripts:',
      '  b:',
      '    script: echo b',
      '    warnPattern: "["', // invalid regex
    ].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');
    await expect(loadConfig(dir)).rejects.toThrow(/warnPattern.*invalid/i);
  });
});
