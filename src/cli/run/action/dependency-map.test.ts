import { describe, expect, it } from 'vitest';

import { filterDependencyMapToAllowlist } from './dependency-map';

describe('filterDependencyMapToAllowlist', () => {
  it('keeps only entries whose keys appear in the allowlist', () => {
    const map = {
      'a/x': { ok: 1 },
      'b/y': { ok: 2 },
    };
    const out = filterDependencyMapToAllowlist(map, ['a/x']);
    expect(out).toEqual({ 'a/x': { ok: 1 } });
  });

  it('normalizes backslashes in allowlist and keys', () => {
    const map = {
      'a\\x': { ok: 1 },
      'b/y': { ok: 2 },
    };
    const out = filterDependencyMapToAllowlist(map, ['a/x']);
    expect(out).toEqual({ 'a\\x': { ok: 1 } });
  });
});
