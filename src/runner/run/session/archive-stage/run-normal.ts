// src/runner/run/session/archive-stage/run-normal.ts
import type { RunBehavior } from '@/runner/run/types';

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
    progress: {
      start: (k: 'full' | 'diff') => void;
      done: (k: 'full' | 'diff', p: string, s: number, e: number) => void;
    };
  },
) => Promise<{ archivePath?: string; diffPath?: string }>;

export const runNonEphemeral = async (args: {
  cwd: string;
  stanPath: string;
  behavior: RunBehavior;
  promptAbs: string | null;
  promptDisplay: string;
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
  prepareIfNeeded: (p: {
    cwd: string;
    stanPath: string;
    promptAbs: string | null;
    promptDisplay: string;
  }) => Promise<(() => Promise<void>) | null>;
  shouldContinue?: () => boolean;
  progress: {
    start: (k: 'full' | 'diff') => void;
    done: (k: 'full' | 'diff', p: string, s: number, e: number) => void;
  };
}): Promise<string[]> => {
  const {
    cwd,
    stanPath,
    behavior,
    promptAbs,
    promptDisplay,
    baseFull,
    baseDiff,
    archivePhase,
    prepareIfNeeded,
    shouldContinue,
    progress,
  } = args;
  const created: string[] = [];

  if (typeof shouldContinue === 'function' && !shouldContinue()) return created;

  const restore = await prepareIfNeeded({
    cwd,
    stanPath,
    promptAbs,
    promptDisplay,
  });
  try {
    if (typeof shouldContinue === 'function' && !shouldContinue())
      return created;
    const d = await archivePhase(
      { cwd, config: baseDiff, includeOutputs: Boolean(behavior.combine) },
      { silent: true, which: 'diff', progress },
    );
    if (d.diffPath) created.push(d.diffPath);
    if (typeof shouldContinue === 'function' && !shouldContinue())
      return created;
    const f = await archivePhase(
      { cwd, config: baseFull, includeOutputs: Boolean(behavior.combine) },
      { silent: true, which: 'full', progress },
    );
    if (f.archivePath) created.push(f.archivePath);
  } finally {
    await restore?.().catch(() => void 0);
  }
  return created;
};
