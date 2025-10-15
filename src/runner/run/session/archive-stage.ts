/* src/stan/run/session/archive-stage.ts
 * Archive phase wrapper: prepare prompt, run archives, and restore.
 */
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { createArchive, createArchiveDiff } from '@karmaniverous/stan-core';

import { stanDirs } from '@/runner/paths';
import {
  cleanupOutputsAfterCombine,
  cleanupPatchDirAfterArchive,
  stageImports,
} from '@/runner/run/archive/util';
import { preparePromptForArchive } from '@/runner/run/prompt';
import { runArchivePhaseAndCollect } from '@/runner/run/session/invoke-archive';
import type { RunnerConfig } from '@/runner/run/types';
import type { RunBehavior } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';
import { readDocsMeta } from '@/runner/system/docs-meta';
import { sha256File } from '@/runner/util/hash';

/** Run the diff archive phase with UI integration; returns absolute diffPath. */
const runDiffPhase = async (args: {
  cwd: string;
  config: ContextConfig;
  includeOutputs: boolean;
  ui: RunnerUI;
}): Promise<string> => {
  const { cwd, config, includeOutputs, ui } = args;
  try {
    ui.onArchiveStart('diff');
  } catch {
    /* ignore */
  }
  const started = Date.now();
  const { diffPath } = await createArchiveDiff({
    cwd,
    stanPath: config.stanPath,
    baseName: 'archive',
    includes: config.includes ?? [],
    excludes: config.excludes ?? [],
    updateSnapshot: 'createIfMissing',
    includeOutputDirInDiff: includeOutputs,
  });
  try {
    ui.onArchiveEnd('diff', diffPath, cwd, started, Date.now());
  } catch {
    /* ignore */
  }
  return diffPath;
};

/** Run the full archive phase with UI integration; returns absolute archivePath. */
const runFullPhase = async (args: {
  cwd: string;
  config: ContextConfig;
  includeOutputs: boolean;
  ui: RunnerUI;
}): Promise<string> => {
  const { cwd, config, includeOutputs, ui } = args;
  try {
    ui.onArchiveStart('full');
  } catch {
    /* ignore */
  }
  const started = Date.now();
  const archivePath = await createArchive(cwd, config.stanPath, {
    includeOutputDir: includeOutputs,
    includes: config.includes ?? [],
    excludes: config.excludes ?? [],
  });
  try {
    ui.onArchiveEnd('full', archivePath, cwd, started, Date.now());
  } catch {
    /* ignore */
  }
  return archivePath;
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

  const dirs = stanDirs(cwd, config.stanPath);
  const systemAbs = dirs.systemFile;

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

    // Stage imports so both diff and full see the same staged context
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
        const diffPath = await runDiffPhase({
          cwd,
          config,
          includeOutputs: Boolean(behavior.combine),
          ui,
        });
        created.push(diffPath);
        // FULL (prompt still materialized)
        const archivePath = await runFullPhase({
          cwd,
          config,
          includeOutputs: Boolean(behavior.combine),
          ui,
        });
        created.push(archivePath);
      } finally {
        await promptRestore?.().catch(() => void 0);
      }
    } else {
      // Quiet-diff: DIFF first (no injection), then inject for FULL and restore
      const diffPath = await runDiffPhase({
        cwd,
        config,
        includeOutputs: Boolean(behavior.combine),
        ui,
      });
      created.push(diffPath);

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
        const archivePath = await runFullPhase({
          cwd,
          config,
          includeOutputs: Boolean(behavior.combine),
          ui,
        });
        created.push(archivePath);
      } finally {
        await promptRestore?.().catch(() => void 0);
      }
    }

    if (behavior.combine) {
      await cleanupOutputsAfterCombine(dirs.output);
    }
    await cleanupPatchDirAfterArchive(cwd, config.stanPath);
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
    const { archivePath, diffPath } = await runArchivePhaseAndCollect({
      cwd,
      config,
      includeOutputs: Boolean(behavior.combine),
      ui,
    });
    created.push(archivePath, diffPath);
  } finally {
    await promptRestore?.().catch(() => void 0);
  }
  return { created, cancelled: false };
};
