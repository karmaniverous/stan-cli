// src/stan/run/prompt.resolve.plan.test.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerConfig } from '@/runner/run';
import { renderRunPlan } from '@/runner/run/plan';
import { asEsmModule } from '@/test/mock-esm';

describe('plan header prompt line (core fallback when no local)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prints core in plan when local is absent and packaged prompt is available', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'stan-plan-core-'));
    try {
      // No local .stan/system/stan.system.md
      const dist = await mkdtemp(path.join(os.tmpdir(), 'stan-core-dist-'));
      const prompt = path.join(dist, 'stan.system.md');
      await writeFile(prompt, '# core prompt\n', 'utf8');

      // ESM-friendly mock: install before importing the SUT that uses core
      vi.resetModules();
      vi.doMock('@karmaniverous/stan-core', () =>
        asEsmModule({
          CORE_VERSION: 'test',
          getPackagedSystemPromptPath: () => prompt,
        }),
      );

      // Import after mocks so the resolver sees our mocked core
      const { resolvePromptOrThrow } = (await import(
        '@/runner/run/session'
      )) as {
        resolvePromptOrThrow: (
          cwd: string,
          stanPath: string,
          promptChoice?: string,
        ) => { display: string; abs: string; kind: 'local' | 'core' | 'path' };
      };

      const stanPath = 'stan';
      const rp = resolvePromptOrThrow(repo, stanPath, 'auto');
      // Compose a plan with the resolved prompt display injected (mirrors printPlanWithPrompt)
      const cfg: RunnerConfig = { stanPath, scripts: {} };
      const plan = renderRunPlan(repo, {
        selection: [],
        config: cfg,
        mode: 'concurrent',
        behavior: { archive: true, live: true, prompt: rp.display },
      });
      expect(plan).toMatch(/prompt:\s+auto\s+→\s+@karmaniverous\/stan-core@/i);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
