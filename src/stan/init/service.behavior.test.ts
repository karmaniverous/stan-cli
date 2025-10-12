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

  it('force on existing YAML: migrates legacy to namespaced, preserves unknown root keys, does not duplicate legacy keys', async () => {
    const p = path.join(dir, 'stan.config.yml');
    // Baseline legacy YAML (pre-namespacing)
    const body = [
      'stanPath: .stan',
      'includes: [src]',
      'excludes: []',
      'cliDefaults:', // legacy root key (will migrate under stan-cli)
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
    // Unknown root key preserved
    expect(after.includes('customAlpha:')).toBe(true);
    expect(after.includes('keep: me')).toBe(true);
    // Namespaced blocks present
    expect(after).toMatch(/^\s*stan-core:\s*$/m);
    expect(after).toMatch(/^\s*stan-cli:\s*$/m);
    // Engine keys live under stan-core
    expect(after).toMatch(/^\s*stan-core:\s*\n\s*stanPath:\s*\.stan/m);
    expect(after).toMatch(/^\s*stan-core:([\s\S]*?)\n\s*excludes:\s*\[\]/m);
    // CLI keys live under stan-cli (scripts migrated)
    expect(after).toMatch(
      /^\s*stan-cli:([\s\S]*?)\n\s*scripts:\s*\n\s* {2}a:\s*echo a/m,
    );
    // Legacy root keys removed (no duplicates at root)
    expect(after).not.toMatch(/^scripts:\s*$/m);
    expect(after).not.toMatch(/^stanPath:\s*$/m);
    // Log message references the exact file name
    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logs).toMatch(/stan: wrote stan\.config\.yml/);
  });

  it('migrates legacy opts.cliDefaults → stan-cli.cliDefaults (YAML)', async () => {
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
    // Namespaced target
    expect(after).toMatch(/^\s*stan-cli:\s*$/m);
    expect(after).toMatch(
      /^\s*stan-cli:([\s\S]*?)\n\s*cliDefaults:\s*\n\s* {2}run:\s*\n\s* {4}archive:\s*false/m,
    );
    // opts.cliDefaults removed; opts removed if empty; no top-level cliDefaults
    expect(after).not.toMatch(/^\s*opts:\s*$/m);
    expect(after).not.toMatch(/^\s*opts:\s*\n\s*cliDefaults:/m);
    expect(after).not.toMatch(/^cliDefaults:\s*$/m);
  });

  it('migrates legacy opts.cliDefaults → stan-cli.cliDefaults and writes JSON back to JSON', async () => {
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
      ['stan-core']?: { stanPath?: string };
      ['stan-cli']?: { cliDefaults?: unknown; scripts?: unknown };
      opts?: unknown;
    };
    // JSON is preserved; cliDefaults migrated under stan-cli
    expect(after['stan-cli']?.cliDefaults).toBeTruthy();
    expect(
      (
        (after['stan-cli']?.cliDefaults ?? {}) as {
          run?: { archive?: boolean };
        }
      ).run?.archive,
    ).toBe(false);
    // opts removed when empty; no top-level cliDefaults/scripts
    expect(after.opts).toBeUndefined();

    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logs).toMatch(/stan: wrote stan\.config\.json/);
  });
});
