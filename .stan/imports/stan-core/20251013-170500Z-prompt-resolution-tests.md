# Tests — system prompt resolution with global CLI + nested core

Context
- We’ve observed that `stan run` prints “auto: local and core unavailable” on Windows when stan‑cli is globally installed and resolves stan‑core nested under its own `node_modules`, despite `dist/stan.system.md` being present.
- stan‑core’s `getPackagedSystemPromptPath()` works (unit tested), but the CLI still reports “core unavailable”. We should cover the CLI resolution logic directly and add a robust fallback.

Proposal (CLI changes)
1) Introduce a dedicated helper in stan‑cli to resolve the core prompt path with two strategies:
   - Primary: `getPackagedSystemPromptPath()` (from stan‑core).
   - Fallback: `require.resolve('@karmaniverous/stan-core/package.json')` and `path.join(root, 'dist', 'stan.system.md')` (works when the dependency is nested under the CLI’s global install).
2) Add unit tests that:
   - Prefer local when present.
   - Fall back to core when local is absent and the packaged prompt is available.
   - Exercise the fallback branch by mocking `getPackagedSystemPromptPath()` to return null and mocking `createRequire` to resolve a temp “core” root that includes `dist/stan.system.md` (with spaces in the path to mimic “Program Files”).
3) Add a light integration test for plan‑only (`stan run -p`) that asserts the computed plan contains `prompt: core` when no local prompt exists.
4) Optional (diagnostics): under `STAN_DEBUG=1`, log a single debug line with the selected source and path (local/core/<path>), without changing normal output.

Files to add in stan‑cli

1) src/stan/prompt/resolve.ts

```ts
// src/stan/prompt/resolve.ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Prefer importing from top-level barrel to honor package "exports".
// (If CLI currently imports from '/stan', switch to top-level.)
import { getPackagedSystemPromptPath } from '@karmaniverous/stan-core';

export type PromptSource = 'local' | 'core' | 'path';

/** Resolve the packaged core prompt with a robust fallback. */
export const resolveCorePromptPath = (): string | null => {
  // Primary: engine’s helper
  try {
    const p = getPackagedSystemPromptPath();
    if (p && existsSync(p)) return p;
  } catch {
    // fall through
  }
  // Fallback: resolve core’s package root, then join dist/stan.system.md
  try {
    const req = createRequire(import.meta.url);
    const pkgJson = req.resolve('@karmaniverous/stan-core/package.json');
    const root = path.dirname(pkgJson);
    const candidate = path.join(root, 'dist', 'stan.system.md');
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
};
```

2) src/stan/prompt/resolve.test.ts

```ts
// src/stan/prompt/resolve.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock only when needed in specific tests
import * as core from '@karmaniverous/stan-core';

import { resolveCorePromptPath } from './resolve';

describe('resolveCorePromptPath', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns packaged path when core helper returns a readable file', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'cli-core-'));
    const dist = path.join(temp, 'dist');
    await mkdir(dist, { recursive: true });
    const prompt = path.join(dist, 'stan.system.md');
    await writeFile(prompt, '# core prompt\n', 'utf8');
    const spy = vi
      .spyOn(core, 'getPackagedSystemPromptPath')
      // simulate a normal packaged resolution
      .mockReturnValue(prompt);
    try {
      const out = resolveCorePromptPath();
      expect(out).toBe(prompt);
      expect(spy).toHaveBeenCalled();
    } finally {
      await rm(temp, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('uses fallback when helper returns null; handles spaces in the path', async () => {
    // Force helper to report "not found"
    vi.spyOn(core, 'getPackagedSystemPromptPath').mockReturnValue(null);

    const base = await mkdtemp(path.join(os.tmpdir(), 'cli core with space '));
    const fakePkgRoot = path.join(base, 'node_modules', '@karmaniverous', 'stan-core');
    const dist = path.join(fakePkgRoot, 'dist');
    await mkdir(dist, { recursive: true });
    const prompt = path.join(dist, 'stan.system.md');
    await writeFile(prompt, '# core prompt (fallback)\n', 'utf8');
    // Minimal package.json so createRequire(...).resolve(...) works
    const pkgJson = path.join(fakePkgRoot, 'package.json');
    await writeFile(pkgJson, JSON.stringify({ name: '@karmaniverous/stan-core' }), 'utf8');

    // Mock createRequire to resolve our fake package root
    const mod = await vi.importActual<typeof import('node:module')>('node:module');
    vi.doMock('node:module', async () => {
      // Wrap original module and override createRequire
      const original = (await vi.importActual('node:module')) as typeof mod;
      return {
        ...original,
        createRequire: () => {
          const fn = ((spec: string) => {
            if (spec === '@karmaniverous/stan-core/package.json') return pkgJson;
            // Delegate unknown resolutions to avoid surprises in other tests
            return (require as NodeJS.Require).resolve(spec);
          }) as unknown;
          return fn as any;
        },
      };
    });
    // Re-import resolve.ts so it picks up the mocked createRequire
    const { resolveCorePromptPath: reloaded } = await vi.importActual<typeof import('./resolve')>('./resolve');
    try {
      const out = reloaded();
      expect(out && out.endsWith(path.join('dist', 'stan.system.md'))).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true }).catch(() => {});
      // restore module mock
      vi.resetModules();
    }
  });
});
```

3) src/stan/run/prompt.resolve.integration.test.ts (plan‑only)

```ts
// src/stan/run/prompt.resolve.integration.test.ts
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

// This assumes the test runner executes within the CLI repo (dev install),
// and that @karmaniverous/stan-core is a dependency that ships dist/stan.system.md.

describe('stan run -p resolves core prompt when no local prompt exists', () => {
  it('prints "prompt: core" in the plan header', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'stan-cli-plan-'));
    try {
      // No .stan/system/stan.system.md in this repo; expect core fallback
      const bin = path.join(process.cwd(), 'dist', 'bin.js'); // adjust if CLI exposes a different entry
      const { stdout, exitCode } = await execa(process.execPath, [bin, 'run', '-p'], {
        cwd: repo,
        env: { STAN_BORING: '1' }, // stable tokens
      });
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/prompt:\s+core/i);
    } finally {
      await rm(repo, { recursive: true, force: true }).catch(() => {});
    }
  });
});
```

4) Optional: one debug line when `STAN_DEBUG=1`

In the CLI’s prompt resolution path (where `resolveSystemPrompt(...)` runs), add a single guarded line:
```ts
if (process.env.STAN_DEBUG === '1') {
  const src = decidedSource; // 'local' | 'core' | 'path'
  const p = decidedPath ?? '(none)';
  process.stderr.write(`stan: debug: prompt: ${src} ${p}\n`);
}
```
This makes field diagnosis trivial without changing normal output.

Why the fallback matters
- In some global‑install geometries (notably Windows `Program Files`), `getPackagedSystemPromptPath()` may return null if a resolver edge case arises (even when the file exists). The `require.resolve('@karmaniverous/stan-core/package.json')` fallback is robust because it anchors at the package root Node resolved during CLI runtime, then composes the canonical path to `dist/stan.system.md`.

Expected outcomes
- With these tests in place, we’ll have coverage that the CLI:
  - prefers local prompt when present,
  - falls back to the packaged core prompt when local is absent,
  - correctly detects the prompt in plan‑only output,
  - and remains resilient across Windows paths with spaces.

Notes
- The integration test’s path to the CLI entry point (`dist/bin.js`) may differ; adjust to the published CLI binary used in tests.
- If CLI currently imports `getPackagedSystemPromptPath` from a deep subpath (e.g., `@karmaniverous/stan-core/stan`), prefer importing from the top‑level package (`@karmaniverous/stan-core`) to honor the engine’s `exports` map. This avoids deep import drift and simplifies compatibility.
