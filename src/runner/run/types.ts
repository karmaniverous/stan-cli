// src/stan/run/types.ts
/**
 * Script selection:
 * - `string[]` selects the listed keys,
 * - `null` denotes “all configured scripts”.
 */
export type Selection = string[] | null;

/** Execution strategy for running scripts. */
export type ExecutionMode = 'concurrent' | 'sequential';

// Runner-local config (CLI-owned scripts + engine stanPath)
import type { ScriptMap } from '@/cli/config/schema';
export type RunnerConfig = {
  stanPath: string;
  scripts: ScriptMap;
  /**
   * Optional engine selection context (propagated to the archive phase).
   * When present, these are honored by createArchive/createArchiveDiff.
   */
  includes?: string[];
  excludes?: string[];
  imports?: Record<string, string[]>;
};
/**
 * Behavior flags controlling archive/combine/keep semantics:
 * - `archive`: create archive.tar and archive.diff.tar.
 * - `combine`: include script outputs inside archives and remove them on disk.
 * - `keep`: do not clear the output directory before running.
 * - `plan`: when false, suppress printing the run plan before execution.
 */
export type RunBehavior = {
  combine?: boolean;
  keep?: boolean;
  archive?: boolean;
  live?: boolean;
  hangWarn?: number;
  hangKill?: number;
  hangKillGrace?: number;
  plan?: boolean;
  /** Plan-only display string for resolved system prompt source (when present). */
  prompt?: string;
};

export type ScriptState =
  | { kind: 'waiting' }
  | { kind: 'running'; startedAt: number; lastOutputAt?: number }
  | { kind: 'warn'; durationMs: number; outputPath?: string }
  | {
      kind: 'quiet';
      startedAt: number;
      lastOutputAt?: number;
      quietFor: number;
    }
  | {
      kind: 'stalled';
      startedAt: number;
      lastOutputAt: number;
      stalledFor: number;
    }
  | { kind: 'done'; durationMs: number; outputPath?: string }
  | { kind: 'error'; durationMs: number; outputPath?: string }
  | { kind: 'timedout'; durationMs: number; outputPath?: string }
  | { kind: 'cancelled'; durationMs?: number }
  | { kind: 'killed'; durationMs?: number };

export type RowMeta = { type: 'script' | 'archive'; item: string };
