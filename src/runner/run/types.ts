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

export type DependencyContext = {
  // Use any to avoid strict coupling with core's unexported/complex types
  meta: any;
  sources: Record<string, any>;
  state?: unknown;
  clean?: boolean;
};

/** Runner-local configuration (CLI-owned scripts + engine selection inputs). */
export type RunnerConfig = {
  /** STAN workspace directory name (e.g., ".stan"). */
  stanPath: string;
  /** CLI-owned scripts mapping (script key -\> command config). */
  scripts: ScriptMap;
  /**
   * Optional engine selection context (propagated to the archive phase).
   * When present, these are honored by createArchive/createArchiveDiff.
   */
  includes?: string[];
  /** Deny-list globs. */
  excludes?: string[];
  /** Optional imports map used to stage external context into <stanPath>/imports. */
  imports?: Record<string, string[]>;
  /**
   * Optional dependency context (meta, state, sources) for context mode.
   * When present, archive phase uses "WithDependencyContext" helpers.
   */
  dependency?: DependencyContext;
};
/**
 * Behavior flags controlling archive/combine/keep semantics:
 * - `archive`: create archive.tar and archive.diff.tar.
 * - `combine`: include script outputs inside archives and remove them on disk.
 * - `keep`: do not clear the output directory before running.
 * - `plan`: when false, suppress printing the run plan before execution.
 */
export type RunBehavior = {
  /** Include script outputs inside archives and remove them from disk afterward. */
  combine?: boolean;
  /** Keep (do not clear) the output directory before running. */
  keep?: boolean;
  /** Enable context mode (dependency graph & staged imports). */
  context?: boolean;
  /** Create archive.tar and archive.diff.tar. */
  archive?: boolean;
  /** Enable the live TTY UI when available. */
  live?: boolean;
  /** Seconds of inactivity before warning/stalled labeling (TTY only). */
  hangWarn?: number;
  /** Seconds of inactivity before terminating the process tree (TTY only). */
  hangKill?: number;
  /** Seconds to wait after SIGTERM before SIGKILL (TTY only). */
  hangKillGrace?: number;
  /** When false, suppress printing the plan header before execution. */
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
