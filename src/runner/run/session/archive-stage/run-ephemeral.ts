// src/runner/run/session/archive-stage/run-ephemeral.ts
import type { RunnerConfig } from '@/runner/run/types';
import type { RunBehavior } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

type ArchivePhase = (
  args: {
    cwd: string;
    config: {
      stanPath: string;
      includes?: string[];
      excludes?: string[];
      imports?: Record<string, string[]>;
      anchors?: string[];
    };
    includeOutputs: boolean;
  },
  opts: {
    silent?: boolean;
    which: 'full' | 'diff';
    stage?: boolean;
    cleanup?: boolean;
    progress: {
      start: (k: 'full' | 'diff') => void;
      done: (k: 'full' | 'diff', p: string, s: number, e: number) => void;
    };
  },
) => Promise<{ archivePath?: string; diffPath?: string }>;

type StageImports = (
  cwd: string,
  stanPath: string,
  map?: Record<string, string[]> | null,
) => Promise<void>;

export const runEphemeral = async (args: {
  cwd: string;
  config: RunnerConfig;
  behavior: RunBehavior;
  ui: RunnerUI;
  promptAbs: string;
  promptDisplay: string;
  includeOnChange: boolean;
  baseFull: {
    stanPath: string;
    includes?: string[];
    excludes?: string[];
    imports?: Record<string, string[]>;
    anchors?: string[];
  };
  baseDiff: {
    stanPath: string;
    includes?: string[];
    excludes?: string[];
    imports?: Record<string, string[]>;
  };
  archivePhase: ArchivePhase;
  stageImports: StageImports;
  preparePrompt: (p: {
    cwd: string;
    stanPath: string;
    promptAbs: string;
    promptDisplay: string;
  }) => Promise<() => Promise<void>>;
  shouldContinue?: () => boolean;
  progress: {
    start: (k: 'full' | 'diff') => void;
    done: (k: 'full' | 'diff', p: string, s: number, e: number) => void;
  };
}): Promise<string[]> => {
  const {
    cwd,
    config,
    behavior,
    promptAbs,
    promptDisplay,
    includeOnChange,
    baseFull,
    baseDiff,
    archivePhase,
    stageImports,
    preparePrompt,
    shouldContinue,
    progress,
  } = args;
  const created: string[] = [];

  if (typeof shouldContinue === 'function' && !shouldContinue()) return created;

  // Stage imports once for both passes; skip stage in individual calls.
  if (typeof shouldContinue !== 'function' || shouldContinue()) {
    await stageImports(cwd, config.stanPath, config.imports);
  } else {
    return created;
  }

  if (includeOnChange) {
    // Inject BEFORE DIFF so the prompt appears exactly once in the diff
    if (typeof shouldContinue === 'function' && !shouldContinue())
      return created;
    const restore = await preparePrompt({
      cwd,
      stanPath: config.stanPath,
      promptAbs,
      promptDisplay,
    });
    try {
      if (typeof shouldContinue === 'function' && !shouldContinue())
        return created;
      const d = await archivePhase(
        { cwd, config: baseDiff, includeOutputs: Boolean(behavior.combine) },
        { silent: true, which: 'diff', stage: false, cleanup: false, progress },
      );
      if (d.diffPath) created.push(d.diffPath);
      if (typeof shouldContinue === 'function' && !shouldContinue())
        return created;
      const f = await archivePhase(
        { cwd, config: baseFull, includeOutputs: Boolean(behavior.combine) },
        { silent: true, which: 'full', stage: false, cleanup: true, progress },
      );
      if (f.archivePath) created.push(f.archivePath);
    } finally {
      await restore().catch(() => void 0);
    }
  } else {
    // Quiet diff first; inject for FULL only
    if (typeof shouldContinue === 'function' && !shouldContinue())
      return created;
    const d = await archivePhase(
      { cwd, config: baseDiff, includeOutputs: Boolean(behavior.combine) },
      { silent: true, which: 'diff', stage: false, cleanup: false, progress },
    );
    if (d.diffPath) created.push(d.diffPath);
    if (typeof shouldContinue === 'function' && !shouldContinue())
      return created;
    const restore = await preparePrompt({
      cwd,
      stanPath: config.stanPath,
      promptAbs,
      promptDisplay,
    });
    try {
      if (typeof shouldContinue === 'function' && !shouldContinue())
        return created;
      const f = await archivePhase(
        { cwd, config: baseFull, includeOutputs: Boolean(behavior.combine) },
        { silent: true, which: 'full', stage: false, cleanup: true, progress },
      );
      if (f.archivePath) created.push(f.archivePath);
    } finally {
      await restore().catch(() => void 0);
    }
  }
  return created;
};
