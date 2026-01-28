import { describe, expect, it } from 'vitest';

import { filterDependencyMapToAllowlist } from './dependency-map';

describe('filterDependencyMapToAllowlist', () => {
  it('keeps only entries whose keys appear in the allowlist', () => {
    const map = {
      v: 1 as const,
      nodes: {
        'a/x': {
          id: 'a/x',
          locatorAbs: '/abs/a/x',
          size: 1,
          sha256: 'a',
        },
        'b/y': {
          id: 'b/y',
          locatorAbs: '/abs/b/y',
          size: 2,
          sha256: 'b',
        },
      },
    };
    const out = filterDependencyMapToAllowlist(map, ['a/x']);
    expect(out).toEqual({
      v: 1,
      nodes: {
        'a/x': {
          id: 'a/x',
          locatorAbs: '/abs/a/x',
          size: 1,
          sha256: 'a',
        },
      },
    });
  });

  it('normalizes backslashes in allowlist and keys', () => {
    const map = {
      v: 1 as const,
      nodes: {
        'a\\x': {
          id: 'a\\x',
          locatorAbs: '/abs/a/x',
          size: 1,
          sha256: 'a',
        },
        'b/y': {
          id: 'b/y',
          locatorAbs: '/abs/b/y',
          size: 2,
          sha256: 'b',
        },
      },
    };
    const out = filterDependencyMapToAllowlist(map, ['a/x']);
    expect(out).toEqual({
      v: 1,
      nodes: {
        'a\\x': {
          id: 'a\\x',
          locatorAbs: '/abs/a/x',
          size: 1,
          sha256: 'a',
        },
      },
    });
  });
});
