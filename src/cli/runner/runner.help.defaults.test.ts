import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import { registerRun } from '.';

describe('run help shows numeric defaults for hang thresholds', () => {
  it('prints (DEFAULT: Ns) for --hang-warn/--hang-kill/--hang-kill-grace', () => {
    const cli = new Command();
    registerRun(cli);
    const run = cli.commands.find((c) => c.name() === 'run');
    expect(run).toBeTruthy();

    let printed = '';
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown): boolean => {
        printed += String(chunk);
        return true;
      });

    run?.outputHelp();
    spy.mockRestore();

    // Commander now shows built-in defaults as "(default: N)"; allow line wrapping with [\s\S].
    expect(printed).toMatch(/--hang-warn[\s\S]*?\(default:\s*120\)/i);
    expect(printed).toMatch(/--hang-kill[\s\S]*?\(default:\s*300\)/i);
    expect(printed).toMatch(/--hang-kill-grace[\s\S]*?\(default:\s*10\)/i);
  });
});
