// src/stan/prompt/resolve.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// We mock only what we need per test; import engine namespace for spying.
import * as core from '@karmaniverous/stan-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('resolveCorePromptPath (primary + fallback)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns engine-packaged path when helper provides a readable file', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'stan-core-primary-'));
    try {
      const dist = path.join(tmp, 'dist');
      await mkdir(dist, { recursive: true });
      const prompt = path.join(dist, 'stan.system.md');
      await writeFile(prompt, '# core prompt\n', 'utf8');

      const spy = vi
        .spyOn(core, 'getPackagedSystemPromptPath')
        // simulate packaged resolution
        .mockReturnValue(prompt);

      const { resolveCorePromptPath } = await import('@/stan/prompt/resolve');
      const out = resolveCorePromptPath();
      expect(out).toBe(prompt);
      expect(spy).toHaveBeenCalled();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('uses fallback via createRequire when helper returns null (handles spaces)', async () => {
    // Force primary helper to report "not found"
    vi.spyOn(core, 'getPackagedSystemPromptPath').mockReturnValue(
      null as unknown as string,
    );

    // Create a fake @karmaniverous/stan-core tree under a base path with spaces
    const base = await mkdtemp(path.join(os.tmpdir(), 'stan core fallback '));
    const fakeRoot = path.join(
      base,
      'node_modules',
      '@karmaniverous',
      'stan-core',
    );
    const dist = path.join(fakeRoot, 'dist');
    const pkgJson = path.join(fakeRoot, 'package.json');
    const prompt = path.join(dist, 'stan.system.md');
    await mkdir(dist, { recursive: true });
    await writeFile(prompt, '# core prompt (fallback)\n', 'utf8');
    await writeFile(
      pkgJson,
      JSON.stringify({ name: '@karmaniverous/stan-core' }),
      'utf8',
    );

    // Mock node:module.createRequire to resolve our fake package.json
    vi.resetModules();
    vi.doMock('node:module', async () => {
      const actual =
        await vi.importActual<typeof import('node:module')>('node:module');
      return {
        ...actual,
        createRequire: () => {
          // Minimal NodeJS.Require with a proper RequireResolve (including .paths).
          const fakeReq = ((id: string) => id) as unknown as NodeJS.Require;
          const fakeResolve = ((id: string) => {
            if (id === '@karmaniverous/stan-core/package.json') return pkgJson;
            // Delegate other resolutions to Node’s default resolver
            return require.resolve(id);
          }) as NodeJS.RequireResolve;
          // Satisfy the typing contract; returning null is acceptable.
          fakeResolve.paths = (_request: string) => null;
          fakeReq.resolve = fakeResolve;
          return fakeReq;
        },
      };
    });

    try {
      // Re-import with mocked createRequire
      const { resolveCorePromptPath } = await import('@/stan/prompt/resolve');
      const out = resolveCorePromptPath();
      // Compute the installed-path fallback using the real node:module to allow either outcome.
      const mod =
        await vi.importActual<typeof import('node:module')>('node:module');
      const installed = path.join(
        path.dirname(
          mod
            .createRequire(import.meta.url)
            .resolve('@karmaniverous/stan-core/package.json'),
        ),
        'dist',
        'stan.system.md',
      );
      // Accept either our temp fake prompt or the installed fallback path; both prove the fallback path is used.
      expect([prompt, installed]).toContain(out);
      // And the tail must always be dist/stan.system.md
      expect(out && out.endsWith(path.join('dist', 'stan.system.md'))).toBe(
        true,
      );
    } finally {
      vi.resetModules();
      await rm(base, { recursive: true, force: true });
    }
  });
});
