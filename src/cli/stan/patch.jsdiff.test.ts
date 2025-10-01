import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Force git-apply path to fail so jsdiff fallback is used
vi.mock('./apply', () => ({
  __esModule: true,
  buildApplyAttempts: () => [],
  runGitApply: () =>
    Promise.resolve({
      ok: false,
      tried: ['3way-nowarn-p1', '3way-ignore-p1', 'reject-nowarn-p1'],
      lastCode: 1,
      captures: [],
    }),
}));

import { registerPatch } from './patch';

describe('jsdiff fallback applies patch and preserves EOL', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-jsdiff-'));
    try {
      process.chdir(dir);
    } catch {
      // ignore
    }
  });

  afterEach(async () => {
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('applies simple patch via jsdiff (git apply mocked to fail)', async () => {
    const rel = 'a.txt';
    // CRLF original
    await writeFile(path.join(dir, rel), 'Hello\r\nWorld\r\n', 'utf8');

    const diff = [
      `diff --git a/${rel} b/${rel}`,
      `--- a/${rel}`,
      `+++ b/${rel}`,
      '@@ -1,2 +1,2 @@',
      ' Hello',
      '-World',
      '+World!',
      '',
    ].join('\n');

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });

    const cli = new Command();
    registerPatch(cli);
    await cli.parseAsync(['node', 'stan', 'patch', diff], { from: 'user' });

    const body = await readFile(path.join(dir, rel), 'utf8');
    expect(body.includes('World!')).toBe(true);
    expect(/\r\n/.test(body)).toBe(true);
    expect(logs.some((l) => /patch applied/i.test(l))).toBe(true);
  });
});
