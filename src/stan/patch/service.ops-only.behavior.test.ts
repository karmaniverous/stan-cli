import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runPatch } from './service';

describe('runPatch — File Ops only (apply and check)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-ops-only-'));
  });

  afterEach(async () => {
    try {
      // Leave temp dir before removal (Windows safety)
      process.chdir(tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('ops-only apply: rm removes the file and prints success', async () => {
    const rel = 'tmp.txt';
    await writeFile(path.join(dir, rel), 'x\n', 'utf8');

    const body = ['### File Ops', `rm ${rel}`].join('\n');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });

    await runPatch(dir, body);
    spy.mockRestore();

    expect(existsSync(path.join(dir, rel))).toBe(false);
    expect(logs.some((l) => /patch applied/i.test(l))).toBe(true);
  });

  it('ops-only check: rm is validated, file remains, prints success', async () => {
    const rel = 'tmp2.txt';
    await writeFile(path.join(dir, rel), 'y\n', 'utf8');

    const body = ['### File Ops', `rm ${rel}`].join('\n');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });

    await runPatch(dir, body, { check: true });
    spy.mockRestore();

    expect(existsSync(path.join(dir, rel))).toBe(true);
    expect(logs.some((l) => /patch check passed/i.test(l))).toBe(true);
  });
});
