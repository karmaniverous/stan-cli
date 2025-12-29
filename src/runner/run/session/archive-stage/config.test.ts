import { describe, expect, it } from 'vitest';

import { makeBaseConfigs } from './config';

describe('makeBaseConfigs', () => {
  it('passes anchors through to both full and diff configs', () => {
    const cfg = {
      stanPath: 'stan',
      scripts: {},
      includes: ['**/*.md'],
      excludes: ['dist/**'],
      imports: { docs: ['README.md'] },
      anchors: ['stan/system/facet.state.json'],
    } as unknown as Parameters<typeof makeBaseConfigs>[0];

    const out = makeBaseConfigs(cfg);

    expect(out.full.anchors).toEqual(['stan/system/facet.state.json']);
    expect(out.diff.anchors).toEqual(['stan/system/facet.state.json']);
  });
});
