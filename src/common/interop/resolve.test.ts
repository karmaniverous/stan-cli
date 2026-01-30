import { describe, expect, it } from 'vitest';

import {
  resolveCallableExport,
  tryResolveCallableExport,
} from '@/common/interop/resolve';

describe('resolveCallableExport', () => {
  it('prefers a named export when present', () => {
    const named = () => 'named';
    const defProp = () => 'defaultProp';
    const mod = { foo: named, default: { foo: defProp } };

    const out = resolveCallableExport<() => string>(mod, 'foo');
    expect(out).toBe(named);
    expect(out()).toBe('named');
  });

  it('resolves default.<name> when named export is absent', () => {
    const fn = () => 'ok';
    const mod = { default: { foo: fn } };

    const out = resolveCallableExport<() => string>(mod, 'foo');
    expect(out).toBe(fn);
    expect(out()).toBe('ok');
  });

  it('can fall back to a callable default export when enabled', () => {
    const fn = () => 'defaultFn';
    const mod = { default: fn };

    const out = resolveCallableExport<() => string>(mod, 'foo', {
      allowDefaultCallable: true,
    });
    expect(out).toBe(fn);
    expect(out()).toBe('defaultFn');
  });

  it('can fall back to a module-as-function when enabled', () => {
    const fn = () => 'moduleFn';
    const mod = fn as unknown;

    const out = resolveCallableExport<() => string>(mod, 'foo', {
      allowModuleCallable: true,
    });
    expect(out).toBe(fn);
    expect(out()).toBe('moduleFn');
  });

  it('can walk nested default chains (bounded) to find default.default.<name>', () => {
    const fn = () => 'nested';
    const mod = { default: { default: { foo: fn } } };

    const out = resolveCallableExport<() => string>(mod, 'foo', {
      maxDefaultDepth: 3,
    });
    expect(out).toBe(fn);
    expect(out()).toBe('nested');
  });

  it('optionally scans the default object for any callable (last resort)', () => {
    const fn = () => 'scanned';
    const mod = { default: { notFoo: fn } };

    const out = resolveCallableExport<() => string>(mod, 'foo', {
      scanDefaultObject: true,
    });
    expect(out).toBe(fn);
    expect(out()).toBe('scanned');
  });
});

describe('tryResolveCallableExport', () => {
  it('returns null instead of throwing when not found', () => {
    const mod = { default: {} };
    const out = tryResolveCallableExport<() => string>(mod, 'missing');
    expect(out).toBeNull();
  });
});
