// src/cli/stan/run/defaults.ts
/**
 * Baseline run defaults (used when neither CLI flags nor cliDefaults provide a value).
 * Centralize here so Commander can display defaults consistently and runtime logic
 * doesn't embed magic numbers.
 */
export const RUN_BASE_DEFAULTS = {
  archive: true,
  combine: false,
  keep: false,
  sequential: false,
  live: true,
  hangWarn: 120,
  hangKill: 300,
  hangKillGrace: 10,
  context: false,
} as const;
