import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('clipboardy', () => ({
  __esModule: true,
  default: {
    read: vi.fn(async () => 'CLIPBOARD_CONTENT'),
  },
}));

import { readPatchSource } from './source';
describe('readPatchSource precedence and behaviors', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-source-'));
  });

  afterEach(async () => {
    try {
      // leave the temp dir before removal (Windows safety)
      process.chdir(tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('uses argument when provided (highest precedence)', async () => {
    const res = await readPatchSource(dir, 'ARG_PATCH');
    expect(res.kind).toBe('argument');
    expect(res.raw).toBe('ARG_PATCH');
  });

  it('reads from file when -f <filename> is provided', async () => {
    const rel = 'test.patch';
    const abs = path.join(dir, rel);
    await writeFile(abs, 'FILE_PATCH\n', 'utf8');
    const res = await readPatchSource(dir, undefined, { file: rel });
    expect(res.kind).toBe('file');
    expect(res.filePathRel).toBe(rel);
    const body = await readFile(abs, 'utf8');
    expect(res.raw).toBe(body);
  });

  it('treats -f without filename as clipboard source', async () => {
    const res = await readPatchSource(dir, undefined, { file: true });
    expect(res.kind).toBe('clipboard');
    expect(res.raw).toBe('CLIPBOARD_CONTENT');
  });

  it('defaults to clipboard when no inputs provided', async () => {
    const res = await readPatchSource(dir);
    expect(res.kind).toBe('clipboard');
    expect(res.raw).toBe('CLIPBOARD_CONTENT');
  });

  it('uses default file from config when provided and not ignored', async () => {
    const rel = 'def.patch';
    const abs = path.join(dir, rel);
    await writeFile(abs, 'DEFAULT_FILE_PATCH\n', 'utf8');
    const res = await readPatchSource(dir, undefined, {
      defaultFile: rel,
    });
    expect(res.kind).toBe('file');
    expect(res.filePathRel).toBe(rel);
    const body = await readFile(abs, 'utf8');
    expect(res.raw).toBe(body);
  });

  it('ignores default file when ignoreDefaultFile=true (-F) and reads clipboard', async () => {
    const rel = 'def.patch';
    const abs = path.join(dir, rel);
    await writeFile(abs, 'DEFAULT_FILE_PATCH\n', 'utf8');
    const res = await readPatchSource(dir, undefined, {
      defaultFile: rel,
      ignoreDefaultFile: true,
    });
    expect(res.kind).toBe('clipboard');
    expect(res.raw).toBe('CLIPBOARD_CONTENT');
  });
});
