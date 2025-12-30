import { describe, expect, it } from 'vitest';

import {
  implicitImportsInclude,
  withImplicitImportsInclude,
} from './implicit-imports';

describe('implicit imports selection helpers', () => {
  it('builds <stanPath>/imports/** in POSIX form', () => {
    expect(implicitImportsInclude('.stan')).toBe('.stan/imports/**');
    expect(implicitImportsInclude('out')).toBe('out/imports/**');
  });

  it('normalizes backslashes and trims trailing slashes', () => {
    expect(implicitImportsInclude('out\\')).toBe('out/imports/**');
    expect(implicitImportsInclude('out/')).toBe('out/imports/**');
  });

  it('appends the pattern when missing (preserve order)', () => {
    expect(withImplicitImportsInclude('.stan', ['a', 'b'])).toEqual([
      'a',
      'b',
      '.stan/imports/**',
    ]);
  });

  it('does not duplicate the pattern', () => {
    expect(
      withImplicitImportsInclude('.stan', ['.stan/imports/**', 'x']),
    ).toEqual(['.stan/imports/**', 'x']);
  });
});
