import { describe, expect, it } from 'vitest';

import {
  asBool,
  asString,
  asStringArray,
  normalizeCliDefaults,
  normalizeMaxUndos,
} from '@/stan/config/normalize';

describe('config normalize helpers', () => {
  it('asBool parses common truthy/falsey cases', () => {
    expect(asBool(true)).toBe(true);
    expect(asBool(false)).toBe(false);
    expect(asBool('true')).toBe(true);
    expect(asBool('1')).toBe(true);
    expect(asBool('false')).toBe(false);
    expect(asBool('0')).toBe(false);
    expect(asBool(1)).toBe(true);
    expect(asBool(0)).toBe(false);
    expect(asBool('nope')).toBeUndefined();
  });

  it('asString returns non-empty strings; otherwise undefined', () => {
    expect(asString('x')).toBe('x');
    expect(asString('')).toBeUndefined();
    expect(asString(123)).toBeUndefined();
  });

  it('asStringArray filters and normalizes only strings', () => {
    expect(asStringArray(['a', ' ', 'b'])).toEqual(['a', 'b']);
    expect(asStringArray(['a', 1, null, 'b'])).toEqual(['a', 'b']);
    expect(asStringArray('not-an-array')).toBeUndefined();
  });

  it('normalizeMaxUndos coerces to integer with sane default', () => {
    expect(normalizeMaxUndos(5)).toBe(5);
    expect(normalizeMaxUndos('7')).toBe(7);
    expect(normalizeMaxUndos('0')).toBe(10);
    expect(normalizeMaxUndos('abc')).toBe(10);
  });

  it('normalizeCliDefaults extracts and coerces nested flags', () => {
    const out = normalizeCliDefaults({
      debug: '1',
      boring: 'true',
      run: {
        archive: '0',
        combine: '1',
        keep: 'false',
        sequential: true,
        plan: 'false',
        scripts: ['lint', 'test'],
      },
      patch: { file: '.stan/patch/last.patch' },
      snap: { stash: '1' },
    });
    expect(out?.debug).toBe(true);
    expect(out?.boring).toBe(true);
    expect(out?.run?.archive).toBe(false);
    expect(out?.run?.combine).toBe(true);
    expect(out?.run?.keep).toBe(false);
    expect(out?.run?.sequential).toBe(true);
    expect(out?.run?.plan).toBe(false);
    expect(out?.run?.scripts).toEqual(['lint', 'test']);
    expect(out?.patch?.file).toBe('.stan/patch/last.patch');
    expect(out?.snap?.stash).toBe(true);
  });
});
