import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureOutputDir, loadConfig } from '@/stan/config';

const write = (p: string, c: string) => writeFile(p, c, 'utf8');
describe('config loading', () => {
  it('loads valid JSON config (stan.config.json)', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'stan-json-'));
    const json = JSON.stringify(
      {
        stanPath: 'stan',
        scripts: {
          test: 'npm run test',
          lint: 'npm run lint',
        },
      },
      null,
      2,
    );
    await write(path.join(cwd, 'stan.config.json'), json);

    const cfg = await loadConfig(cwd);
    expect(cfg.stanPath).toBe('stan');
    expect(Object.keys(cfg.scripts)).toEqual(['test', 'lint']);

    const out = await ensureOutputDir(cwd, cfg.stanPath);
    await mkdir(out, { recursive: true }); // idempotent
  });

  it('loads valid YAML config (stan.config.yml)', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'stan-yml-'));
    const yml = [
      'stanPath: stan',
      'scripts:',
      '  test: npm run test',
      '  typecheck: npm run typecheck',
    ].join('\n');
    await write(path.join(cwd, 'stan.config.yml'), yml);

    const cfg = await loadConfig(cwd);
    expect(cfg.stanPath).toBe('stan');
    expect(Object.keys(cfg.scripts)).toEqual(['test', 'typecheck']);
  });

  it('rejects "archive" and "init" keys in scripts', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'stan-bad-'));
    const yml = [
      'stanPath: stan',
      'scripts:',
      '  archive: nope',
      '  init: nope2',
    ].join('\n');
    await write(path.join(cwd, 'stan.config.yml'), yml);
    await expect(loadConfig(cwd)).rejects.toThrow(
      /archive.*init.*not allowed/i,
    );
  });
});
