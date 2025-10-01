// src/stan/run/types.ts
/**
 * Script selection:
 * - `string[]` selects the listed keys,
 * - `null` denotes “all configured scripts”.
 */
export type Selection = string[] | null;

/** Execution strategy for running scripts. */
export type ExecutionMode = 'concurrent' | 'sequential';

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
};
