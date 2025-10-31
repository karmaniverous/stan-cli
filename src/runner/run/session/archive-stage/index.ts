import path from 'node:path';

import type { RunnerConfig } from '@/runner/run/types';
import type { RunBehavior } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

import { makeBaseConfigs } from './config';
import { getArchivePhase, getStageImports } from './imports';
import { buildArchiveProgress } from './progress';
import { decideIncludeOnChange, isEphemeralPrompt } from './prompt-ephemeral';
import { preparePromptOrThrow } from './prompt-prepare';
import { runArchiveUnified } from './run-archive';

export const runArchiveStage = async (args: {
  cwd: string;
  config: RunnerConfig;
  behavior: RunBehavior;
  ui: RunnerUI;
  promptAbs: string | null;
  promptDisplay: string;
  /** Optional guard to abort work when cancellation is requested. */
  shouldContinue?: () => boolean;
}): Promise<{ created: string[]; cancelled: boolean }> => {
  const { cwd, config, behavior, ui, promptAbs, promptDisplay } = args;
  const shouldContinue =
    typeof args.shouldContinue === 'function'
      ? args.shouldContinue
      : () => true;
  const created: string[] = [];

  if (!shouldContinue()) return { created, cancelled: true };

  // Resolve archive utilities at call time (SSR-robust)
  const archivePhase = getArchivePhase();
  const stageImports = getStageImports();

  const systemAbs = path.join(cwd, config.stanPath, 'system', 'stan.system.md');
  const { full: baseFull, diff: baseDiff } = makeBaseConfigs(config);
  const progress = buildArchiveProgress(ui, cwd);

  const ephemeral = isEphemeralPrompt(systemAbs, promptAbs);
  if (ephemeral) {
    if (!shouldContinue()) return { created, cancelled: true };

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
      const out = await runArchiveUnified({
        cwd,
        stanPath: config.stanPath,
        behavior,
        promptAbs: promptAbs as string,
        promptDisplay,
        baseFull,
        baseDiff,
        archivePhase,
        stageImports: async (
          c: string,
          sp: string,
          m?: Record<string, string[]> | null,
        ): Promise<void> => {
          try {
            await stageImports(c, sp, m);
          } catch {
            /* best-effort */
          }
        },
        preparePrompt: ({
          cwd,
          stanPath,
          promptAbs,
          promptDisplay,
        }: {
          cwd: string;
          stanPath: string;
          promptAbs: string;
          promptDisplay: string;
        }) =>
          preparePromptOrThrow({
            cwd,
            stanPath,
            promptAbs,
            promptDisplay,
          }),
        shouldContinue,
        progress,
        ephemeral: true,
        includeOnChange,
        importsMap: config.imports,
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
    if (!shouldContinue()) return { created, cancelled: true };
    const out = await runArchiveUnified({
      cwd,
      stanPath: config.stanPath,
      behavior,
      promptAbs,
      promptDisplay,
      baseFull,
      baseDiff,
      archivePhase,
      prepareIfNeeded: async ({
        cwd,
        stanPath,
        promptAbs,
        promptDisplay,
      }: {
        cwd: string;
        stanPath: string;
        promptAbs: string | null;
        promptDisplay: string;
      }) => {
        if (!promptAbs) return null;
        return preparePromptOrThrow({
          cwd,
          stanPath,
          promptAbs,
          promptDisplay,
        });
      },
      shouldContinue,
      progress,
      ephemeral: false,
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
