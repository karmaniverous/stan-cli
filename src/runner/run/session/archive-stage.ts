/* src/stan/run/session/archive-stage.ts
 * Archive phase wrapper: prepare prompt, run archives, and restore.
 */
import path from 'node:path';

import * as archiveMod from '@/runner/run/archive';
import { preparePromptForArchive } from '@/runner/run/prompt';
import type { RunnerConfig } from '@/runner/run/types';
import type { RunBehavior } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';
import { readDocsMeta } from '@/runner/system/docs-meta';
import { sha256File } from '@/runner/util/hash';

type ArchiveModule = typeof import('@/runner/run/archive');
const getArchivePhase = (): ArchiveModule['archivePhase'] => {
  const mod = archiveMod as unknown as {
    archivePhase?: unknown;
    default?: { archivePhase?: unknown };
  };
  const named = mod?.archivePhase;
  const viaDefault = mod?.default?.archivePhase;
  const fn =
    typeof named === 'function'
      ? (named as ArchiveModule['archivePhase'])
      : typeof viaDefault === 'function'
        ? (viaDefault as ArchiveModule['archivePhase'])
        : undefined;
  if (!fn) throw new Error('archivePhase not found');
  return fn;
};
const getStageImports = (): ArchiveModule['stageImports'] => {
  const mod = archiveMod as unknown as {
    stageImports?: unknown;
    default?: { stageImports?: unknown };
  };
  const named = mod?.stageImports;
  const viaDefault = mod?.default?.stageImports;
  const fn =
    typeof named === 'function'
      ? (named as ArchiveModule['stageImports'])
      : typeof viaDefault === 'function'
        ? (viaDefault as ArchiveModule['stageImports'])
        : undefined;
  if (!fn) throw new Error('stageImports not found');
  return fn;
};

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

  // DRY: shared engine config and UI progress hooks for archivePhase calls.
  const baseCfg: {
    stanPath: string;
    includes?: string[];
    excludes?: string[];
    imports?: Record<string, string[]>;
    anchors?: string[];
  } = {
    stanPath: config.stanPath,
    includes: config.includes ?? [],
    excludes: config.excludes ?? [],
    imports: config.imports,
    anchors: config.anchors ?? [],
  };
  const progress = {
    start: (k: 'full' | 'diff') => ui.onArchiveStart(k),
    done: (k: 'full' | 'diff', p: string, s: number, e: number) =>
      ui.onArchiveEnd(k, p, cwd, s, e),
  } as const;

  // Ephemeral = non-local source file (e.g., core/path) provided for this run
  const isEphemeralPrompt =
    Boolean(promptAbs) &&
    path.resolve(promptAbs as string) !== path.resolve(systemAbs);

  if (isEphemeralPrompt) {
    // Decide include-on-change vs quiet-diff using baseline prompt hash recorded at snap.
    // Fallbacks:
    // - Missing docs.meta or prompt -> treat as "changed" (include-on-change).
    // - Hashing failure -> treat as "unchanged" (quiet).
    let includeOnChange = true;
    let currentHash: string | undefined;
    try {
      if (promptAbs) currentHash = await sha256File(promptAbs);
    } catch {
      currentHash = undefined;
    }
    try {
      const meta = await readDocsMeta(cwd, config.stanPath);
      const baseline =
        meta?.prompt && typeof meta.prompt === 'object'
          ? (meta.prompt as { hash?: string }).hash
          : undefined;
      if (baseline && currentHash) {
        includeOnChange = baseline !== currentHash;
      } else if (!baseline) {
        // docs.meta missing prompt fields -> changed once
        includeOnChange = true;
      } else if (!currentHash) {
        // hashing failed -> prefer quiet path
        includeOnChange = false;
      }
    } catch {
      // On read error, include-on-change once (treat as changed)
      includeOnChange = true;
    }

    // Stage imports once so both diff and full see the same staged context.
    // Subsequent archivePhase calls skip staging and defer cleanup to the full pass.
    await stageImports(cwd, config.stanPath, config.imports);

    if (includeOnChange) {
      // Inject BEFORE DIFF so the prompt appears exactly once in the diff
      let promptRestore: null | (() => Promise<void>) = null;
      try {
        if (promptAbs) {
          const { restore } = await preparePromptForArchive(
            cwd,
            config.stanPath,
            {
              abs: promptAbs,
              display: promptDisplay,
              kind: 'path',
            },
          );
          promptRestore = restore;
        }
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === 'string'
              ? e
              : String(e);
        console.error(`stan: error: failed to prepare system prompt (${msg})`);
        console.log('');
        try {
          ui.stop();
        } catch {
          /* ignore */
        }
        return { created, cancelled: true };
      }

      try {
        // DIFF (prompt materialized)
        const diffOut = await archivePhase(
          {
            cwd,
            config: baseCfg,
            includeOutputs: Boolean(behavior.combine),
          },
          {
            silent: true,
            which: 'diff',
            stage: false, // staged above
            cleanup: false, // defer to FULL
            progress,
          },
        );
        if (diffOut.diffPath) created.push(diffOut.diffPath);

        // FULL (prompt still materialized; perform cleanup)
        const fullOut = await archivePhase(
          {
            cwd,
            config: baseCfg,
            includeOutputs: Boolean(behavior.combine),
          },
          {
            silent: true,
            which: 'full',
            stage: false,
            cleanup: true,
            progress,
          },
        );
        if (fullOut.archivePath) created.push(fullOut.archivePath);
      } finally {
        await promptRestore?.().catch(() => void 0);
      }
    } else {
      // Quiet-diff: DIFF first (no injection), then inject for FULL and restore
      const diffOut = await archivePhase(
        {
          cwd,
          config: baseCfg,
          includeOutputs: Boolean(behavior.combine),
        },
        {
          silent: true,
          which: 'diff',
          stage: false, // staged above
          cleanup: false, // defer to FULL
          progress,
        },
      );
      if (diffOut.diffPath) created.push(diffOut.diffPath);

      let promptRestore: null | (() => Promise<void>) = null;
      try {
        if (promptAbs) {
          const { restore } = await preparePromptForArchive(
            cwd,
            config.stanPath,
            {
              abs: promptAbs,
              display: promptDisplay,
              kind: 'path',
            },
          );
          promptRestore = restore;
        }
        const fullOut = await archivePhase(
          {
            cwd,
            config: baseCfg,
            includeOutputs: Boolean(behavior.combine),
          },
          {
            silent: true,
            which: 'full',
            stage: false,
            cleanup: true,
            progress,
          },
        );
        if (fullOut.archivePath) created.push(fullOut.archivePath);
      } finally {
        await promptRestore?.().catch(() => void 0);
      }
    }

    return { created, cancelled: false };
  }

  // Non‑ephemeral path: present the prompt for both full and diff and restore afterward.
  let promptRestore: null | (() => Promise<void>) = null;
  try {
    if (promptAbs) {
      const { restore } = await preparePromptForArchive(cwd, config.stanPath, {
        abs: promptAbs,
        display: promptDisplay,
        kind: 'path',
      });
      promptRestore = restore;
    }
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

  try {
    const { archivePath, diffPath } = await archivePhase(
      {
        cwd,
        config: baseCfg,
        includeOutputs: Boolean(behavior.combine),
      },
      {
        silent: true,
        which: 'both',
        progress,
      },
    );
    if (archivePath) created.push(archivePath);
    if (diffPath) created.push(diffPath);
  } finally {
    await promptRestore?.().catch(() => void 0);
  }
  return { created, cancelled: false };
};
