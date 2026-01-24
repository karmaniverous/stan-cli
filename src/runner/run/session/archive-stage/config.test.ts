import { describe, expect, it } from 'vitest';

import { makeBaseConfigs } from './config';

describe('makeBaseConfigs', () => {
  it('passes fields through to both full and diff configs', () => {
    const cfg = {
      stanPath: 'stan',
      scripts: {},
      includes: ['**/*.md'],
      excludes: ['dist/**'],
      imports: { docs: ['README.md'] },
    } as unknown as Parameters<typeof makeBaseConfigs>[0];

    const out = makeBaseConfigs(cfg);

    expect(out.full.stanPath).toBe('stan');
    expect(out.diff.stanPath).toBe('stan');
  });
});
