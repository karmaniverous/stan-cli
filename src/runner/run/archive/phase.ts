/**
 * Archive phase orchestration for `stan run`: creates full/diff/meta archives,
 * including dependency-context (“context mode”) archives via stan-core.
 * Logs selection summaries via `onSelectionReport`; performs fs + console IO.
 * @module
 */
import { copyFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type { ContextConfig, SelectionReport } from '@karmaniverous/stan-core';
import {
  createArchive,
  createArchiveDiff,
  createContextArchiveDiffWithDependencyContext,
  createContextArchiveWithDependencyContext,
  createMetaArchive,
} from '@karmaniverous/stan-core';
import { exists } from 'fs-extra';

import { stanDirs } from '@/runner/paths';
import {
  cleanupOutputsAfterCombine,
  cleanupPatchDirAfterArchive,
  stageImports,
} from '@/runner/run/archive/util';
import type { DependencyContext } from '@/runner/run/types';
import { withImplicitImportsInclude } from '@/runner/selection/implicit-imports';
import { alert, ok } from '@/runner/util/color';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object';

const getStateEntries = (state: unknown): unknown[] => {
  if (!isRecord(state)) return [];
  const i = state.i;
  return Array.isArray(i) ? i : [];
};

const getStateNodeId = (entry: unknown): string | null => {
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry) && typeof entry[0] === 'string') return entry[0];
  return null;
};

const stateExplicitlySelectsExternalContext = (
  state: unknown,
  stanPath: string,
): boolean => {
  const npmPrefix = `${stanPath}/context/npm/`;
  const absPrefix = `${stanPath}/context/abs/`;
  for (const e of getStateEntries(state)) {
    const id = getStateNodeId(e);
    if (!id) continue;
    if (id.startsWith(npmPrefix) || id.startsWith(absPrefix)) return true;
  }
  return false;
};

const uniqueStrings = (items: readonly string[]): string[] =>
  Array.from(new Set(items));

const externalContextExcludes = (stanPath: string): readonly string[] => [
  `${stanPath}/context/npm/**`,
  `${stanPath}/context/abs/**`,
];

type WithDeps = {
  includes?: string[];
  excludes?: string[];
  dependency?: DependencyContext;
  meta?: boolean;
};

// Progress callbacks for live renderer integration
type ArchiveProgress = {
  /** Called when a phase starts (kind: 'full' | 'diff'). */
  start?: (kind: 'full' | 'diff' | 'meta') => void;
  /**
   * Called when a phase completes.
   * @param kind - 'full' | 'diff'
   * @param pathAbs - Absolute path to the created archive
   * @param startedAt - ms epoch
   * @param endedAt - ms epoch
   */
  done?: (
    kind: 'full' | 'diff' | 'meta',
    pathAbs: string,
    startedAt: number,
    endedAt: number,
  ) => void;
};
/**
 * Run the archive phase and produce both regular and diff archives.
 *
 * @param args - Object with:
 *   - cwd: Repo root.
 *   - config: Resolved STAN configuration.
 *   - includeOutputs: When true, include `<stanPath>/output` inside archives.
 * @returns `{ archivePath?, diffPath? }` absolute paths to the created archives.
 */
export const archivePhase = async (
  args: {
    cwd: string;
    config: ContextConfig & WithDeps;
    includeOutputs: boolean;
  },
  opts?: {
    progress?: ArchiveProgress;
    silent?: boolean;
    /**
     * Which phases to run:
     * - 'both' (default): full then diff,
     * - 'full': full only,
     * - 'diff': diff only.
     */
    which?: 'both' | 'full' | 'diff';
    /**
     * When false, skip staging imports in this call (useful for multi-call flows).
     * Default true.
     */
    stage?: boolean;
    /**
     * When false, skip cleanup (combine outputs, patch dir). Default true.
     * Useful for multi-call flows; pass cleanup: true for the final call.
     */
    cleanup?: boolean;
    /**
     * Optional late-cancel guard to abort before starting each phase.
     */
    shouldContinue?: () => boolean;
  },
): Promise<{ archivePath?: string; diffPath?: string }> => {
  const { cwd, config, includeOutputs } = args;
  const { dependency } = config;

  const reportSelection = (report: SelectionReport) => {
    const { kind, counts, hasWarnings } = report;
    const c = counts;
    const parts = [
      `candidates ${String(c.candidates)}`,
      `selected ${String(c.selected)}`,
      `archived ${String(c.archived)}`,
    ];
    if (c.excludedBinaries > 0)
      parts.push(`binaries ${String(c.excludedBinaries)}`);
    if (c.largeText > 0) parts.push(`large ${String(c.largeText)}`);
    const warn = hasWarnings ? ' (warnings)' : '';
    const label = kind === 'diff' ? 'diff' : kind === 'meta' ? 'meta' : 'full';
    // Print to console (CLI-owned)
    console.log(`stan: selection (${label}): ${parts.join(', ')}${warn}`);
  };

  const silent = Boolean(opts?.silent);
  const which: 'both' | 'full' | 'diff' = opts?.which ?? 'both';
  const doStage = opts?.stage !== false;
  const doCleanup = opts?.cleanup !== false;
  const dirs = stanDirs(cwd, config.stanPath);
  const shouldContinue =
    typeof opts?.shouldContinue === 'function'
      ? opts.shouldContinue
      : undefined;
  const includes = withImplicitImportsInclude(
    config.stanPath,
    config.includes ?? [],
  );
  const baseExcludes = config.excludes ?? [];
  const excludesForContext =
    dependency &&
    !stateExplicitlySelectsExternalContext(dependency.state, config.stanPath)
      ? uniqueStrings([
          ...baseExcludes,
          ...externalContextExcludes(config.stanPath),
        ])
      : baseExcludes;

  if (!silent && (which === 'both' || which === 'full')) {
    console.log(`stan: start "${alert('archive')}"`);
  }

  let archivePath: string | undefined;
  let diffPath: string | undefined;
  try {
    // Stage imports (if any) so they are included in selected archives.
    if (doStage) {
      if (shouldContinue && !shouldContinue()) return { archivePath, diffPath };
      await stageImports(cwd, config.stanPath, config.imports);
    }

    if (which === 'both' || which === 'full') {
      if (shouldContinue && !shouldContinue()) return { archivePath, diffPath };
      const fullKind: 'full' | 'meta' = config.meta ? 'meta' : 'full';
      opts?.progress?.start?.(fullKind);
      const startedFull = Date.now();

      if (config.meta) {
        // Meta archive mode: generate meta archive and rename to archive.tar.
        // Rotate existing archive.tar -> archive.prev.tar first.
        const outDir = path.join(cwd, config.stanPath, 'output');
        const tarAbs = path.join(outDir, 'archive.tar');
        const prevAbs = path.join(
          cwd,
          config.stanPath,
          'diff',
          'archive.prev.tar',
        );
        if (await exists(tarAbs)) {
          await copyFile(tarAbs, prevAbs);
        }
        const metaPath = await createMetaArchive(
          cwd,
          config.stanPath,
          {
            includes,
            excludes: baseExcludes,
          },
          {
            includeOutputDir: includeOutputs,
            onSelectionReport: reportSelection,
          },
        );
        // Rename meta archive to standard archive.tar name so it serves as the full archive
        await rename(metaPath, tarAbs);
        archivePath = tarAbs;
      } else if (dependency) {
        const res = await createContextArchiveWithDependencyContext({
          cwd,
          stanPath: config.stanPath,
          dependency,
          selection: {
            includes,
            excludes: excludesForContext,
          },
          archive: {
            includeOutputDir: false,
            onSelectionReport: reportSelection,
          },
        });
        archivePath = res.archivePath;
      } else {
        archivePath = await createArchive(cwd, config.stanPath, {
          includeOutputDir: includeOutputs,
          includes,
          excludes: baseExcludes,
          onSelectionReport: reportSelection,
        } as Parameters<typeof createArchive>[2]);
      }

      opts?.progress?.done?.(fullKind, archivePath, startedFull, Date.now());
      // Late-cancel cleanup: if a cancellation arrived right after FULL completed,
      // prefer to remove the freshly created archive immediately to avoid any
      // visibility races at the session boundary (best‑effort).
      if (shouldContinue && !shouldContinue()) {
        try {
          if (archivePath) await rm(archivePath, { force: true });
        } catch {
          /* ignore */
        }
        return { archivePath: undefined, diffPath };
      }
      if (!silent) {
        console.log(
          `stan: ${ok('done')} "${alert('archive')}" -> ${alert(archivePath ? archivePath.replace(/\\/g, '/') : '')}`,
        );
      }
    }

    if (!silent && (which === 'both' || which === 'diff')) {
      console.log(`stan: start "${alert('archive (diff)')}"`);
    }
    if (which === 'both' || which === 'diff') {
      if (shouldContinue && !shouldContinue()) return { archivePath, diffPath };
      opts?.progress?.start?.('diff');
      const startedDiff = Date.now();

      let out: { diffPath: string };
      if (dependency) {
        out = (await createContextArchiveDiffWithDependencyContext({
          cwd,
          stanPath: config.stanPath,
          dependency,
          selection: {
            includes,
            excludes: excludesForContext,
          },
          diff: {
            onSelectionReport: reportSelection,
            baseName: 'archive',
            updateSnapshot: 'createIfMissing',
            includeOutputDirInDiff: false,
            snapshotFileName: '.archive.snapshot.context.json',
          },
        })) as { diffPath: string };
      } else {
        out = (await createArchiveDiff({
          cwd,
          stanPath: config.stanPath,
          baseName: 'archive',
          includes,
          excludes: baseExcludes,
          updateSnapshot: 'createIfMissing',
          includeOutputDirInDiff: includeOutputs,
          onSelectionReport: reportSelection,
        } as Parameters<typeof createArchiveDiff>[0])) as { diffPath: string };
      }

      diffPath = out.diffPath;
      opts?.progress?.done?.('diff', diffPath, startedDiff, Date.now());
      // Late-cancel cleanup: if cancellation lands immediately after DIFF,
      // remove the diff archive before returning so nothing leaks to disk.
      if (shouldContinue && !shouldContinue()) {
        try {
          await rm(diffPath, { force: true });
        } catch {
          /* ignore */
        }
        return { archivePath, diffPath: undefined };
      }
      if (!silent) {
        console.log(
          `stan: ${ok('done')} "${alert('archive (diff)')}" -> ${alert(
            diffPath.replace(/\\/g, '/'),
          )}`,
        );
      }
    }
  } finally {
    // No packaged prompt injection/restore; prompt is managed upstream for both full and diff.
  }
  if (doCleanup) {
    if (includeOutputs) {
      if (!dependency) {
        await cleanupOutputsAfterCombine(dirs.output);
      } else if (!silent) {
        console.log(
          `stan: ${alert('warn')} combine mode (-b) ignored in context mode`,
        );
      }
    }
    await cleanupPatchDirAfterArchive(cwd, config.stanPath);
  }

  return { archivePath, diffPath };
};
