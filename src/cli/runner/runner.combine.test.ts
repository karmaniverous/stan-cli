import { describe, expect, it } from 'vitest';

import { deriveRunInvocation } from '../run-args';

describe('CLI -c/--combine, -k/--keep, -a/--archive (new flags)', () => {
  const cfg = {
    stanPath: 'stan',
    scripts: { test: 'echo test', lint: 'echo lint' },
  };

  it('passes combine, keep, archive flags with -s (no keys => all)', () => {
    const d = deriveRunInvocation({
      scriptsProvided: true,
      scriptsOpt: [], // presence of -s with no keys => all scripts
      combine: true,
      keep: true,
      archive: true,
      config: cfg,
    });
    expect(d.selection).toEqual(['test', 'lint']);
    expect(d.mode).toBe('concurrent');
    expect(d.behavior).toMatchObject({
      combine: true,
      keep: true,
      archive: true,
    });
  });

  it('filters -s selection to known keys and preserves order', () => {
    const d = deriveRunInvocation({
      scriptsProvided: true,
      scriptsOpt: ['lint', 'test', 'nope'],
      archive: true,
      config: cfg,
    });
    expect(d.selection).toEqual(['lint', 'test']);
    expect(d.behavior.archive).toBe(true);
  });
});
