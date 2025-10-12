/* src/stan/run/session/archive-stage.ts
 * Archive phase wrapper: prepare prompt, run archives, and restore.
 */
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import path, { resolve as resolvePath } from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import {
  createArchive,
  createArchiveDiff,
  prepareImports,
} from '@karmaniverous/stan-core';

import { preparePromptForArchive } from '@/stan/run/prompt';
import { runArchivePhaseAndCollect } from '@/stan/run/session/invoke-archive';
import type { RunnerConfig } from '@/stan/run/types';
import type { RunBehavior } from '@/stan/run/types';
import type { RunnerUI } from '@/stan/run/ui';

/**
 * Remove on‑disk script outputs after combine mode archived them.
 * Keeps `archive.tar` and `archive.diff.tar` in place.
 */
const cleanupOutputsAfterCombine = async (outAbs: string): Promise<void> => {
  const keepNames = new Set(['archive.tar', 'archive.diff.tar']);
  try {
    const entries = await readdir(outAbs, { withFileTypes: true });
    await Promise.all(
      entries.map(async (e) => {
        if (keepNames.has(e.name)) return;
        await rm(resolvePath(outAbs, e.name), { recursive: true, force: true });
      }),
    );
  } catch {
    /* best‑effort */
  }
};

/** Clear `<stanPath>/patch` contents after archiving (preserve the directory). */
const cleanupPatchDirAfterArchive = async (
  cwd: string,
  stanPath: string,
): Promise<void> => {
  const patchAbs = path.join(cwd, stanPath, 'patch');
  try {
    const entries = await readdir(patchAbs, { withFileTypes: true });
    await Promise.all(
      entries.map((e) =>
        rm(resolvePath(patchAbs, e.name), { recursive: true, force: true }),
      ),
    );
  } catch {
    /* best‑effort */
  }
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

  // If the local prompt does not exist and we are using a non‑local source,
  // treat the prompt as “ephemeral” for this run. In that case, create the DIFF
  // BEFORE materializing the prompt so it does not appear in every diff archive.
  const systemAbs = path.join(cwd, config.stanPath, 'system', 'stan.system.md');
  const hadLocalPrompt = existsSync(systemAbs);
  const isEphemeralPrompt = Boolean(promptAbs) && !hadLocalPrompt;

  // Ephemeral path: DIFF -> inject prompt -> FULL -> restore
  if (isEphemeralPrompt) {
    // Stage imports so both diff and full see the same staged context
    try {
      if (config.imports && typeof config.imports === 'object') {
        await prepareImports({
          cwd,
          stanPath: config.stanPath,
          map: config.imports,
        });
      }
    } catch {
      /* best‑effort */
    }

    // 1) Diff first (no prompt materialized)
    try {
      ui.onArchiveStart('diff');
    } catch {
      /* ignore */
    }
    const startedDiff = Date.now();
    const { diffPath } = await createArchiveDiff({
      cwd,
      stanPath: config.stanPath,
      baseName: 'archive',
      includes: (config as ContextConfig).includes ?? [],
      excludes: (config as ContextConfig).excludes ?? [],
      updateSnapshot: 'createIfMissing',
      includeOutputDirInDiff: Boolean(behavior.combine),
    });
    try {
      ui.onArchiveEnd('diff', diffPath, cwd, startedDiff, Date.now());
    } catch {
      /* ignore */
    }
    created.push(diffPath);

    // 2) Inject prompt just for the full archive
    let promptRestore: null | (() => Promise<void>) = null;
    try {
      if (promptAbs) {
        const { restore } = await preparePromptForArchive(
          cwd,
          config.stanPath,
          { abs: promptAbs, display: promptDisplay, kind: 'path' },
        );
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
      // 3) Full archive
      try {
        ui.onArchiveStart('full');
      } catch {
        /* ignore */
      }
      const startedFull = Date.now();
      const archivePath = await createArchive(cwd, config.stanPath, {
        includeOutputDir: Boolean(behavior.combine),
        includes: (config as ContextConfig).includes ?? [],
        excludes: (config as ContextConfig).excludes ?? [],
      });
      try {
        ui.onArchiveEnd('full', archivePath, cwd, startedFull, Date.now());
      } catch {
        /* ignore */
      }
      created.push(archivePath);
    } finally {
      await promptRestore?.().catch(() => void 0);
    }

    // Combine cleanup/parity
    if (behavior.combine) {
      const outAbs = path.join(cwd, config.stanPath, 'output');
      await cleanupOutputsAfterCombine(outAbs);
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
