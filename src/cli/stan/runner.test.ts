import { describe, expect, it } from 'vitest';

import type { ContextConfig } from '@/stan/config';

import { deriveRunInvocation } from './run-args';

describe('CLI argument parsing (new selection model)', () => {
  const cfg: ContextConfig = {
    stanPath: 'stan',
    scripts: { test: 'echo test', lint: 'echo lint' },
  };

  it('passes -x selection with provided keys (all except <keys>)', () => {
    const d = deriveRunInvocation({
      scriptsProvided: false,
      scriptsOpt: undefined,
      exceptProvided: true,
      exceptOpt: ['test'],
      sequential: false,
      combine: false,
      keep: false,
      archive: false,
      config: cfg,
    });
    expect(d.selection).toEqual(['lint']); // all except 'test'
    expect(d.mode).toBe('concurrent');
  });

  it('passes -q to run sequentially and preserves -s order', () => {
    const d = deriveRunInvocation({
      scriptsProvided: true,
      scriptsOpt: ['lint', 'test', 'nope'],
      exceptProvided: false,
      sequential: true,
      config: cfg,
    });
    expect(d.selection).toEqual(['lint', 'test']);
    expect(d.mode).toBe('sequential');
  });

  it('-s with no keys selects all known scripts', () => {
    const d = deriveRunInvocation({
      scriptsProvided: true,
      scriptsOpt: [], // explicit presence with no keys
      exceptProvided: false,
      config: cfg,
    });
    // derive preserves config order; since cfg order is test, lint:
    expect(d.selection).toEqual(['test', 'lint']);
  });
});
