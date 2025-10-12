import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSelected } from './run';

describe('run plan header', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stan-plan-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('prints a multi-line plan with mode/output/scripts flags', async () => {
    const cfg = {
      stanPath: 'stan',
      scripts: {}, // no scripts; plan should show "scripts: none"
    };

    const lines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      lines.push(String(m));
    });

    // selection=null => "run all" (none here), default mode concurrent
    await runSelected(dir, cfg, null, 'concurrent');

    logSpy.mockRestore();

    const printed = lines.join('\n');
    expect(printed).toContain('STAN run plan');
    expect(printed).toContain('mode: concurrent');
    expect(printed).toContain('output: stan/output/');
    expect(printed).toContain('scripts: none');
    expect(printed).toMatch(/archive:\s+(yes|no)/);
    expect(printed).toMatch(/combine:\s+(yes|no)/);
    expect(printed).toMatch(/keep output dir:\s+(yes|no)/);
  });
});
