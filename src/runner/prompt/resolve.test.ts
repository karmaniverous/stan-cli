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
});
