import { writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, loadConfigSync, resolveStanPathSync } from '@/stan/config';

const write = (p: string, s: string) => writeFile(p, s, 'utf8');

describe('config.load (additional branch coverage)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-config-load-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('normalizes devMode (string truthy), patchOpenCommand default, and maxUndos from string', async () => {
    const yml = [
      'stanPath: out',
      'scripts:',
      '  a: echo a',
      'maxUndos: "7"',
      'devMode: "1"', // string truthy -> boolean true
      // patchOpenCommand omitted -> falls back to DEFAULT_OPEN_COMMAND
    ].join('\n');
    await write(path.join(dir, 'stan.config.yml'), yml);

    const cfg = await loadConfig(dir);
    expect(cfg.stanPath).toBe('out');
    expect(cfg.scripts).toEqual({ a: 'echo a' });
    expect(cfg.maxUndos).toBe(7);
    expect(cfg.devMode).toBe(true);
    // default from DEFAULT_OPEN_COMMAND ('code -g {file}')
    expect(typeof cfg.patchOpenCommand).toBe('string');
    expect(
      cfg.patchOpenCommand && cfg.patchOpenCommand.includes('{file}'),
    ).toBe(true);
  });

  it('throws when stanPath is not a non-empty string', async () => {
    const bad = ['stanPath: 0', 'scripts: {}'].join('\n');
    await write(path.join(dir, 'stan.config.yml'), bad);
    await expect(loadConfig(dir)).rejects.toThrow(/stanPath.*non-empty/i);
  });

  it('throws when scripts is not an object', async () => {
    const bad = ['stanPath: out', 'scripts: 42'].join('\n');
    await write(path.join(dir, 'stan.config.yml'), bad);
    await expect(loadConfig(dir)).rejects.toThrow(/scripts.*object/i);
  });

  it('loadConfigSync yields defaults for optional arrays and command when omitted', () => {
    const yml = ['stanPath: out', 'scripts:', '  a: echo a'].join('\n');
    const p = path.join(dir, 'stan.config.yml');
    // sync writer to keep test concise
    writeFileSync(p, yml, 'utf8');
    const cfg = loadConfigSync(dir);
    expect(cfg.includes).toEqual([]);
    expect(cfg.excludes).toEqual([]);
    expect(typeof cfg.patchOpenCommand).toBe('string');
  });
  it('resolveStanPathSync falls back to default when no config exists', () => {
    const stan = resolveStanPathSync(dir);
    expect(stan).toBe('.stan');
  });
});
