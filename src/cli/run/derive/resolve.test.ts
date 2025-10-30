import { beforeEach, describe, expect, it, vi } from 'vitest';

// We will import the SUT after installing mocks for SSR-like module shape tests.

describe('derive: resolveDRI fallback shapes (SSR-robust)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('resolves when run-args exports default as a function (function-as-default)', async () => {
    // Mock the module that dri.ts resolves: ../../run-args (aliased here by its absolute alias)
    // Provide default as a callable function (function-as-default).
    const marker = Symbol('default-fn');
    vi.doMock('@/cli/run-args', () => {
      const def = () => marker as unknown as void;
      return { __esModule: true, default: def };
    });

    const { resolveDRI } = (await import('@/cli/run/derive/dri')) as {
      resolveDRI: () => (args: {
        scriptsProvided?: boolean;
        scriptsOpt?: unknown;
        exceptProvided?: boolean;
        exceptOpt?: unknown;
        sequential?: unknown;
        combine?: unknown;
        keep?: unknown;
        archive?: unknown;
        config: { scripts?: Record<string, unknown> };
      }) => unknown;
    };
    const fn = resolveDRI();
    // Returns a callable; we assert it does not throw when invoked with minimal args.
    const out = fn({
      scriptsProvided: false,
      scriptsOpt: undefined,
      exceptProvided: false,
      exceptOpt: undefined,
      sequential: undefined,
      combine: undefined,
      keep: undefined,
      archive: undefined,
      config: { scripts: {} },
    });
    // Only assert callability (shape), not engine semantics here.
    expect(typeof fn).toBe('function');
    void out;
  });

  it('resolves when run-args exports default object with deriveRunInvocation', async () => {
    vi.resetModules();
    const marker = Symbol('default.obj.derive');
    vi.doMock('@/cli/run-args', () => {
      const deriveRunInvocation = () => marker as unknown as void;
      return { __esModule: true, default: { deriveRunInvocation } };
    });

    const { resolveDRI } = (await import('@/cli/run/derive/dri')) as {
      resolveDRI: () => (args: {
        scriptsProvided?: boolean;
        scriptsOpt?: unknown;
        exceptProvided?: boolean;
        exceptOpt?: unknown;
        sequential?: unknown;
        combine?: unknown;
        keep?: unknown;
        archive?: unknown;
        config: { scripts?: Record<string, unknown> };
      }) => unknown;
    };
    const fn = resolveDRI();
    const out = fn({
      scriptsProvided: false,
      scriptsOpt: undefined,
      exceptProvided: false,
      exceptOpt: undefined,
      sequential: undefined,
      combine: undefined,
      keep: undefined,
      archive: undefined,
      config: { scripts: {} },
    });
    expect(typeof fn).toBe('function');
    void out;
  });
});
