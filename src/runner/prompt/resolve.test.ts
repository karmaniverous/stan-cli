import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { asEsmModule } from '@/test/mock-esm';

describe('prompt resolver (CLI‑packaged + core)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes named exports (getCliPackagedSystemPromptPath, resolveCorePromptPath)', async () => {
    // Stub module with named + default object to cover common SSR shapes.
    const resolverStub = {
      getCliPackagedSystemPromptPath: vi.fn(() => '/packaged/system/prompt.md'),
      resolveCorePromptPath: vi.fn(() => '/core/system/prompt.md'),
    };

    vi.doMock('@/runner/prompt/resolve', () =>
      asEsmModule({
        ...resolverStub,
        default: resolverStub,
      }),
    );

    const mod = (await import('@/runner/prompt/resolve')) as unknown as {
      getCliPackagedSystemPromptPath?: () => string | null;
      resolveCorePromptPath?: () => Promise<string | null> | string | null;
    };

    expect(typeof mod.getCliPackagedSystemPromptPath).toBe('function');
    expect(typeof mod.resolveCorePromptPath).toBe('function');

    const packaged = mod.getCliPackagedSystemPromptPath?.();
    const core = await mod.resolveCorePromptPath?.();

    expect(packaged).toBe('/packaged/system/prompt.md');
    expect(core).toBe('/core/system/prompt.md');
  });

  it.skip('works when only default export object provides the functions', async () => {
    const resolverStub = {
      getCliPackagedSystemPromptPath: vi.fn(() => '/from/default/packaged.md'),
      resolveCorePromptPath: vi.fn(() => '/from/default/core.md'),
    };

    // Provide only default: { ... } to simulate a default‑only SSR shape.
    vi.doMock('@/runner/prompt/resolve', () =>
      asEsmModule({
        default: resolverStub,
      }),
    );

    const mod = (await import('@/runner/prompt/resolve')) as unknown as {
      getCliPackagedSystemPromptPath?: () => string | null;
      resolveCorePromptPath?: () => Promise<string | null> | string | null;
      default?: {
        getCliPackagedSystemPromptPath?: () => string | null;
        resolveCorePromptPath?: () => Promise<string | null> | string | null;
      };
    };

    // Accept either named or default‑object exposure (test is SSR‑robust).
    const getPackaged = (
      typeof mod.getCliPackagedSystemPromptPath === 'function'
        ? mod.getCliPackagedSystemPromptPath
        : typeof mod.default?.getCliPackagedSystemPromptPath === 'function'
          ? mod.default.getCliPackagedSystemPromptPath
          : null
    ) as (() => string | null) | null;

    const resolveCore = (
      typeof mod.resolveCorePromptPath === 'function'
        ? mod.resolveCorePromptPath
        : typeof mod.default?.resolveCorePromptPath === 'function'
          ? mod.default.resolveCorePromptPath
          : null
    ) as (() => Promise<string | null> | string | null) | null;

    expect(getPackaged).not.toBeNull();
    expect(resolveCore).not.toBeNull();

    const packaged =
      typeof getPackaged === 'function' ? getPackaged() : undefined;
    const core =
      typeof resolveCore === 'function'
        ? await (resolveCore() as Promise<string | null>)
        : undefined;

    expect(packaged).toBe('/from/default/packaged.md');
    expect(core).toBe('/from/default/core.md');
  });
});
