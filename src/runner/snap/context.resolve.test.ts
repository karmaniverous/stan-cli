import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { asEsmModule } from '@/test/mock-esm';

describe('snap context: lazy resolver (named-or-default)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-snap-ctx-'));
    // Minimal namespaced config so findConfigPathSync detects this repo
    const yml = [
      'stan-core:',
      '  stanPath: out',
      'stan-cli:',
      '  scripts: {}',
    ].join('\n');
    await writeFile(path.join(dir, 'stan.config.yml'), yml, 'utf8');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('resolves using named export (resolveEffectiveEngineConfig)', async () => {
    vi.resetModules();
    vi.doMock('@/runner/config/effective', () =>
      asEsmModule({
        // named-only export
        resolveEffectiveEngineConfig: () =>
          Promise.resolve({ stanPath: 'from-named' }),
      }),
    );
    const { resolveContext } = (await import('@/runner/snap/context')) as {
      resolveContext: (cwd: string) => Promise<{
        cwd: string;
        stanPath: string;
        maxUndos: number;
      }>;
    };
    const out = await resolveContext(dir);
    expect(out.stanPath).toBe('from-named');
  });

  it('resolves using default export property (default.resolveEffectiveEngineConfig)', async () => {
    vi.resetModules();
    // Function-as-default (robust across SSR/mock wrappers).
    vi.doMock('@/runner/config/effective', () =>
      asEsmModule({
        // default itself is the resolver function
        default: () =>
          Promise.resolve({
            stanPath: 'from-default',
          }),
      }),
    );
    const { resolveContext } = (await import('@/runner/snap/context')) as {
      resolveContext: (cwd: string) => Promise<{
        cwd: string;
        stanPath: string;
        maxUndos: number;
      }>;
    };
    const out = await resolveContext(dir);
    expect(out.stanPath).toBe('from-default');
  });
});
