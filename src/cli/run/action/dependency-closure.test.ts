import { describe, expect, it } from 'vitest';

import { computeSelectedNodeIdsFromMetaAndState } from './dependency-closure';

describe('computeSelectedNodeIdsFromMetaAndState', () => {
  it('expands includes by depth and does not include unseeded nodes', () => {
    const meta = {
      v: 2 as const,
      n: {
        'src/main.ts': { e: [['node_modules/my-dep/index.js', 1]] },
        'src/ignored.ts': { e: [['node_modules/unused-dep/index.js', 1]] },
        'node_modules/my-dep/index.js': {},
        'node_modules/unused-dep/index.js': {},
      },
    };
    const state = { v: 2 as const, i: [['src/main.ts', 1]] };
    const out = computeSelectedNodeIdsFromMetaAndState(meta, state);
    expect(out).toEqual(['node_modules/my-dep/index.js', 'src/main.ts']);
  });

  it('applies excludes (excludes win)', () => {
    const meta = {
      v: 2 as const,
      n: {
        'src/main.ts': { e: [['node_modules/my-dep/index.js', 1]] },
        'node_modules/my-dep/index.js': {},
      },
    };
    const state = {
      v: 2 as const,
      i: [['src/main.ts', 1]],
      x: ['node_modules/my-dep/index.js'],
    };
    const out = computeSelectedNodeIdsFromMetaAndState(meta, state);
    expect(out).toEqual(['src/main.ts']);
  });

  it('normalizes backslashes in meta/state node IDs', () => {
    const meta = {
      v: 2 as const,
      n: {
        'src\\main.ts': { e: [['node_modules\\my-dep\\index.js', 1]] },
        'node_modules\\my-dep\\index.js': {},
      },
    };
    const state = { v: 2 as const, i: [['src\\main.ts', 1]] };
    const out = computeSelectedNodeIdsFromMetaAndState(meta, state);
    expect(out).toEqual(['node_modules/my-dep/index.js', 'src/main.ts']);
  });

  it('throws on invalid shapes (caller can fall back to full map)', () => {
    expect(() =>
      computeSelectedNodeIdsFromMetaAndState({ v: 1, n: {} }, { v: 2, i: [] }),
    ).toThrow();
    expect(() =>
      computeSelectedNodeIdsFromMetaAndState(
        { v: 2, n: {} },
        { v: 2, i: 'nope' },
      ),
    ).toThrow();
  });
});
