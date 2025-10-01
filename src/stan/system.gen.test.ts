import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleSystemPrompt } from '../../tools/gen-system';

const read = (p: string) => readFile(p, 'utf8');

describe('gen-system (assemble parts into stan.system.md)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-gen-system-'));
  });

  afterEach(async () => {
    // leave temp dir before removal (Windows safety)
    try {
      process.chdir(os.tmpdir());
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('no parts -> no changes (leave target as-is if present)', async () => {
    const sysRoot = path.join(dir, '.stan', 'system');
    await mkdir(sysRoot, { recursive: true });
    const target = path.join(sysRoot, 'stan.system.md');
    await writeFile(target, '# monolith\n', 'utf8');

    const out = await assembleSystemPrompt(dir);
    expect(out).toBe(target);
    const body = await read(out);
    expect(body).toBe('# monolith\n');
  });

  it('assembles parts in numeric/lex order with a single generated header', async () => {
    const parts = path.join(dir, '.stan', 'system', 'parts');
    await mkdir(parts, { recursive: true });
    await writeFile(path.join(parts, '00-title.md'), '# Title\nA', 'utf8');
    await writeFile(path.join(parts, '10-body.md'), 'Body\nB', 'utf8');

    const out = await assembleSystemPrompt(dir);
    const body = await read(out);
    // Header + parts in order separated by one blank line and trailing newline
    expect(body.startsWith('<!-- GENERATED: assembled')).toBe(true);
    expect(body).toContain('# Title\nA\n\nBody\nB\n');
  });
});
