import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asEsmModule } from '@/test/mock-esm';

describe('derive: resolveDRI fallback shapes (SSR-robust)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('resolves when run-args default object exposes deriveRunInvocation', async () => {
    // dri.ts imports "../../run-args"; mock that exact specifier.
    vi.doMock('../../run-args', () =>
      asEsmModule({
        default: {
          deriveRunInvocation: () => ({
            selection: [],
            mode: 'concurrent',
            behavior: {},
          }),
        },
      }),
    );

    const { resolveDRI } = (await import('@/cli/run/derive/dri')) as {
      resolveDRI: () => (...a: unknown[]) => unknown;
    };
    const fn = resolveDRI();
    expect(typeof fn).toBe('function');
    // Exercise call defensively; ignore result (shape-only assertion).
    fn({
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
  });

  it('resolves when run-args exposes deriveRunInvocation (named export)', async () => {
    vi.resetModules();
    vi.doMock('../../run-args', () =>
      asEsmModule({
        deriveRunInvocation: () => ({
          selection: [],
          mode: 'concurrent',
          behavior: {},
        }),
      }),
    );

    const { resolveDRI } = (await import('@/cli/run/derive/dri')) as {
      resolveDRI: () => (...a: unknown[]) => unknown;
    };
    const fn = resolveDRI();
    expect(typeof fn).toBe('function');
    fn({
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
  });
});
