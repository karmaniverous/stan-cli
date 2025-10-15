// src/stan/run/session/types.ts
import type { ExecutionMode, RunBehavior } from '@/runner/run/types';
import type { RunnerConfig } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

export type SessionArgs = {
  cwd: string;
  config: RunnerConfig;
  selection: string[];
  mode: ExecutionMode;
  behavior: RunBehavior;
  liveEnabled: boolean;
  planBody?: string;
  printPlan?: boolean;
  ui: RunnerUI;
  promptChoice?: string;
};

export type SessionOutcome = {
  created: string[];
  cancelled: boolean;
  restartRequested: boolean;
};

export type Epoch = symbol;
