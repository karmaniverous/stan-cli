// src/runner/run/session/archive-stage/run-archive.ts
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
    /** Optional late-cancel guard forwarded into archive phase. */
    shouldContinue?: () => boolean;
    /** Optional stage/cleanup flags are managed externally in the unified flow. */
  },
) => Promise<{ archivePath?: string; diffPath?: string }>;

type StageImports = (
  cwd: string,
  stanPath: string,
  map?: Record<string, string[]> | null,
) => Promise<void>;

/**
 * Unified archive runner (ephemeral and non‑ephemeral).
 *  - Ephemeral:
 *    • includeOnChange=true: inject BEFORE diff so prompt appears exactly once in diff; then full.
 *    • includeOnChange=false: quiet diff first; inject ONLY for full.
 *  - Non‑ephemeral:
 *    • prepare once when needed; run diff then full; restore afterward.
 */
export const runArchiveUnified = async (args: {
  cwd: string;
  stanPath: string;
  behavior: RunBehavior;
  // prompt
  promptAbs: string | null;
  promptDisplay: string;
  // base selections
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
  // utilities
  archivePhase: ArchivePhase;
  stageImports?: StageImports;
  preparePrompt?: (p: {
    cwd: string;
    stanPath: string;
    promptAbs: string;
    promptDisplay: string;
  }) => Promise<() => Promise<void>>;
  prepareIfNeeded?: (p: {
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
  // mode
  ephemeral: boolean;
  includeOnChange?: boolean;
  importsMap?: Record<string, string[] | undefined> | null;
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
    stageImports,
    preparePrompt,
    prepareIfNeeded,
    shouldContinue,
    progress,
    ephemeral,
    includeOnChange,
    importsMap,
  } = args;

  const created: string[] = [];
  const includeOutputs = Boolean(behavior.combine);
  const posix = (p: string): string => p.replace(/\\+/g, '/');

  // Optional imports staging (ephemeral path stages once for both passes)
  if (ephemeral && typeof stageImports === 'function') {
    if (typeof shouldContinue !== 'function' || shouldContinue())
      await stageImports(cwd, stanPath, importsMap);
    else return created;
  }

  const runDiff = async (): Promise<void> => {
    if (typeof shouldContinue === 'function' && !shouldContinue()) return;

    // Quiet DIFF on unchanged ephemeral prompt:
    // If a prior snapshot captured an injected stan.system.md but includeOnChange=false
    // now suppresses injection, exclude the file from DIFF to avoid a spurious “deletion.”
    const diffCfg =
      ephemeral && includeOnChange === false
        ? {
            ...baseDiff,
            excludes: [
              ...(baseDiff.excludes ?? []),
              posix(`${stanPath}/system/stan.system.md`),
            ],
          }
        : baseDiff;

    const d = await archivePhase(
      { cwd, config: diffCfg, includeOutputs },
      { silent: true, which: 'diff', progress, shouldContinue },
    );
    if (d.diffPath) created.push(d.diffPath);
  };

  const runFull = async (): Promise<void> => {
    if (typeof shouldContinue === 'function' && !shouldContinue()) return;
    const f = await archivePhase(
      { cwd, config: baseFull, includeOutputs },
      { silent: true, which: 'full', progress, shouldContinue },
    );
    if (f.archivePath) created.push(f.archivePath);
  };

  if (ephemeral) {
    // Ephemeral sources require preparePrompt(...) (non-null promptAbs)
    if (!promptAbs || typeof preparePrompt !== 'function') return created;

    if (includeOnChange) {
      // Inject BEFORE DIFF so the prompt appears exactly once in the diff
      const restore = await preparePrompt({
        cwd,
        stanPath,
        promptAbs,
        promptDisplay,
      });
      try {
        await runDiff();
        await runFull();
      } finally {
        await restore().catch(() => void 0);
      }
      return created;
    }
    // Quiet diff; then inject for FULL only
    await runDiff();
    const restore = await preparePrompt({
      cwd,
      stanPath,
      promptAbs,
      promptDisplay,
    });
    try {
      await runFull();
    } finally {
      await restore().catch(() => void 0);
    }
    return created;
  }

  // Non‑ephemeral: prepare once if a path was chosen; else use local only.
  const restoreMaybe =
    typeof prepareIfNeeded === 'function'
      ? await prepareIfNeeded({ cwd, stanPath, promptAbs, promptDisplay })
      : null;
  try {
    await runDiff();
    await runFull();
  } finally {
    await restoreMaybe?.().catch(() => void 0);
  }
  return created;
};
