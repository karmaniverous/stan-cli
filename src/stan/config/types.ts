/* src/stan/config/types.ts
 * Shared types for STAN configuration and CLI defaults.
 */

/** A script entry may be a raw command string or an object with an optional warnPattern. */
export type ScriptEntry = string | { script: string; warnPattern?: string };

export type ScriptMap = Record<string, ScriptEntry>;

export type CliDefaultsRun = {
  archive?: boolean;
  combine?: boolean;
  keep?: boolean;
  sequential?: boolean;
  live?: boolean;
  plan?: boolean;
  hangWarn?: number;
  hangKill?: number;
  hangKillGrace?: number;
  scripts?: boolean | string[];
};
export type CliDefaultsPatch = { file?: string | null | undefined };
export type CliDefaultsSnap = { stash?: boolean };
export type CliDefaults = {
  debug?: boolean;
  boring?: boolean;
  patch?: CliDefaultsPatch;
  run?: CliDefaultsRun;
  snap?: CliDefaultsSnap;
};

/**
 * Resolved STAN configuration. * - Paths like stanPath/output and stanPath/diff are referred to without angle *   brackets to avoid confusion with HTML-like tags in TSDoc.
 */
export type ContextConfig = {
  stanPath: string;
  scripts: ScriptMap;
  /**
   * Additive allow‑list globs for archiving/snapshot logic.
   * - Augments the base selection (which applies .gitignore and default denials).
   * - Explicit `excludes` take precedence over `includes` (i.e., excludes always win).
   * - `includes` can bring back files ignored by `.gitignore` or default denials.
   * - Reserved exclusions still apply: `<stanPath>/diff` is always excluded;
   *   `<stanPath>/output` is excluded unless explicitly included by combine mode at archive time.
   */
  includes?: string[];
  /** Paths to exclude in archiving logic (globs supported). */
  excludes?: string[];
  /** Maximum retained snapshot "undos" (history depth for snap undo/redo). */
  maxUndos?: number /** Optional developer-mode switch to treat the current repo as the STAN dev module. */;
  devMode?: boolean;
  /**
   * Staged imports (archiving only): label -\> glob(s) to copy under <stanPath>/imports/<label>/...
   */
  imports?: Record<string, string | string[]>;
  /**
   * Phase-scoped CLI defaults used by adapters when flags are omitted.
   * Top-level (no 'opts' wrapper).   */
  cliDefaults?: CliDefaults;
  /** Command template to open modified files after a successful patch. */
  patchOpenCommand?: string;
};
