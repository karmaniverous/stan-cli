// src/runner/run/session/archive-stage/index.ts
import path from 'node:path';

import type { RunnerConfig } from '@/runner/run/types';
import type { RunBehavior } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

import { makeBaseConfigs } from './config';
import { getArchivePhase, getStageImports } from './imports';
import { buildArchiveProgress } from './progress';
import { decideIncludeOnChange, isEphemeralPrompt } from './prompt-ephemeral';
import { preparePromptOrThrow } from './prompt-prepare';
import { runEphemeral } from './run-ephemeral';
import { runNonEphemeral } from './run-normal';

export const runArchiveStage = async (args: {
  cwd: string;
  config: RunnerConfig;
  behavior: RunBehavior;
  ui: RunnerUI;
  promptAbs: string | null;
  promptDisplay: string;
}): Promise<{ created: string[]; cancelled: boolean }> => {
  const { cwd, config, behavior, ui, promptAbs, promptDisplay } = args;
  const created: string[] = [];

  // Resolve archive utilities at call time (SSR-robust)
  const archivePhase = getArchivePhase();
  const stageImports = getStageImports();

  const systemAbs = path.join(cwd, config.stanPath, 'system', 'stan.system.md');
  const { full: baseFull, diff: baseDiff } = makeBaseConfigs(config);
  const progress = buildArchiveProgress(ui, cwd);

  const ephemeral = isEphemeralPrompt(systemAbs, promptAbs);
  if (ephemeral) {
    let includeOnChange = true;
    try {
      includeOnChange = await decideIncludeOnChange({
        cwd,
        stanPath: config.stanPath,
        promptAbs: promptAbs,
      });
    } catch {
      includeOnChange = true;
    }

    try {
      const out = await runEphemeral({
        cwd,
        config,
        behavior,
        ui,
        promptAbs: promptAbs as string,
        promptDisplay,
        includeOnChange,
        baseFull,
        baseDiff,
        archivePhase,
        stageImports: async (c, sp, m) => {
          try {
            await stageImports(c, sp, m);
          } catch {
            /* best-effort */
          }
        },
        preparePrompt: ({ cwd, stanPath, promptAbs, promptDisplay }) =>
          preparePromptOrThrow({
            cwd,
            stanPath,
            promptAbs,
            promptDisplay,
          }),
        progress,
      });
      created.push(...out);
      return { created, cancelled: false };
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
      console.error(`stan: error: failed to prepare system prompt (${msg})`);
      console.log('');
      try {
        ui.stop();
      } catch {
        /* ignore */
      }
      return { created, cancelled: true };
    }
  }

  // Non‑ephemeral path: prepare when promptAbs provided; otherwise use local only.
  try {
    const out = await runNonEphemeral({
      cwd,
      stanPath: config.stanPath,
      behavior,
      promptAbs,
      promptDisplay,
      baseFull,
      baseDiff,
      archivePhase,
      prepareIfNeeded: async ({ cwd, stanPath, promptAbs, promptDisplay }) => {
        if (!promptAbs) return null;
        return preparePromptOrThrow({
          cwd,
          stanPath,
          promptAbs,
          promptDisplay,
        });
      },
      progress,
    });
    created.push(...out);
    return { created, cancelled: false };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
    console.error(`stan: error: failed to prepare system prompt (${msg})`);
    console.log('');
    try {
      ui.stop();
    } catch {
      /* ignore */
    }
    return { created, cancelled: true };
  }
};
