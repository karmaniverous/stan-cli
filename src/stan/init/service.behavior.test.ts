import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { performInitService } from '@/stan/init/service';

const readUtf8 = (p: string) => readFile(p, 'utf8');
const writeUtf8 = (p: string, s: string) => writeFile(p, s, 'utf8');

describe('init service behavior (preserve config, migrate opts.cliDefaults, same path/format)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-init-svc-'));
  });

  afterEach(async () => {
    // Leave the temp dir to avoid Windows EBUSY on rm
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('force on existing YAML: preserves unknown keys and relative key order; appends defaults only', async () => {
    const p = path.join(dir, 'stan.config.yml');
    // Baseline YAML with a stable order
    const body = [
      'stanPath: .stan',
      'includes: [src]',
      'excludes: []',
      'cliDefaults:',
      '  run:',
      '    archive: false',
      'customAlpha:',
      '  keep: me',
      'scripts:',
      '  a: echo a',
      '',
    ].join('\n');
    await writeUtf8(p, body);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const out = await performInitService({ cwd: dir, force: true });
    expect(out).toBe(p);

    const after = await readUtf8(p);
    // Unknown key preserved
    expect(after.includes('customAlpha:')).toBe(true);
    expect(after.includes('keep: me')).toBe(true);
    // Relative order among existing keys maintained (stanPath before cliDefaults before scripts)
    const iStan = after.indexOf('stanPath:');
    const iCli = after.indexOf('cliDefaults:');
    const iScripts = after.indexOf('scripts:');
    expect(iStan).toBeGreaterThan(-1);
    expect(iCli).toBeGreaterThan(iStan);
    expect(iScripts).toBeGreaterThan(iCli);
    // Log message references the exact file name
    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logs).toMatch(/stan: wrote stan\.config\.yml/);
  });

  it('migrates legacy opts.cliDefaults → top-level cliDefaults (YAML)', async () => {
    const p = path.join(dir, 'stan.config.yml');
    const legacy = [
      'stanPath: .stan',
      'opts:',
      '  cliDefaults:',
      '    run:',
      '      archive: false',
      'scripts: {}',
      '',
    ].join('\n');
    await writeUtf8(p, legacy);

    await performInitService({ cwd: dir, force: true });
    const after = await readUtf8(p);
    expect(after).toMatch(/^\s*cliDefaults:/m);
    expect(after).toMatch(/run:\s*\n\s*archive:\s*false/m);
    // opts.cliDefaults removed; opts removed if empty
    expect(after).not.toMatch(/^\s*opts:\s*$/m);
    expect(after).not.toMatch(/^\s*opts:\s*\n\s*cliDefaults:/m);
  });

  it('migrates legacy opts.cliDefaults → top-level cliDefaults and writes JSON back to JSON', async () => {
    const p = path.join(dir, 'stan.config.json');
    const legacy = {
      stanPath: '.stan',
      opts: {
        cliDefaults: {
          run: { archive: false },
        },
      },
      scripts: {},
    };
    await writeUtf8(p, JSON.stringify(legacy, null, 2) + '\n');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const out = await performInitService({ cwd: dir, force: true });
    expect(out).toBe(p);

    const after = JSON.parse(await readUtf8(p)) as {
      stanPath?: string;
      cliDefaults?: unknown;
      opts?: unknown;
      scripts?: unknown;
    };
    expect(after.cliDefaults).toBeTruthy();
    expect(
      (after.cliDefaults as { run?: { archive?: boolean } }).run?.archive,
    ).toBe(false);
    // opts removed when empty
    expect(after.opts).toBeUndefined();

    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logs).toMatch(/stan: wrote stan\.config\.json/);
  });
});
