// src/cli/run/derive/types.ts
import type { ExecutionMode, RunBehavior } from '@/runner/run';

/** Shape for effective run defaults (merged from config over baselines). */
export type RunDefaultsShape = {
  archive: boolean;
  combine: boolean;
  plan: boolean;
  keep: boolean;
  sequential: boolean;
  live: boolean;
  hangWarn: number;
  hangKill: number;
  hangKillGrace: number;
  prompt: string;
  context: boolean;
};

/** Public return type for deriveRunParameters. */
export type DerivedRun = {
  selection: string[];
  mode: ExecutionMode;
  behavior: RunBehavior;
  promptChoice: string;
};

export {};
