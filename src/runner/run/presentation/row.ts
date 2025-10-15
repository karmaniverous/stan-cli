// src/runner/run/presentation/row.ts
import { label } from '@/runner/run/labels';
import { fmtMs } from '@/runner/run/live/format';
import type { ScriptState } from '@/runner/run/types';
import { relOut } from '@/runner/run/util/path';

export type Presentation = {
  /** BORING/TTY-aware status label (e.g., [OK], ✔︎ ok) */
  label: string;
  /** Elapsed time string mm:ss ('' when not applicable) */
  time: string;
  /** Repo-relative output path for terminal rendering ('' when not applicable) */
  output: string;
};

type LabelKind =
  | 'warn'
  | 'waiting'
  | 'run'
  | 'ok'
  | 'error'
  | 'cancelled'
  | 'timeout'
  | 'quiet'
  | 'stalled'
  | 'killed';

const toLabelKind = (st: ScriptState): LabelKind => {
  switch (st.kind) {
    case 'warn':
      return 'warn';
    case 'waiting':
      return 'waiting';
    case 'running':
      return 'run';
    case 'quiet':
      return 'quiet';
    case 'stalled':
      return 'stalled';
    case 'done':
      return 'ok';
    case 'error':
      return 'error';
    case 'timedout':
      return 'timeout';
    case 'cancelled':
      return 'cancelled';
    case 'killed':
      return 'killed';
    default:
      return 'waiting';
  }
};

/** Map a row's ScriptState to presentational fields (status label, time, output). */
export const presentRow = (args: {
  state: ScriptState;
  cwd: string;
  now?: () => number;
}): Presentation => {
  const { state, cwd, now } = args;
  const k = toLabelKind(state);
  // Time
  let time = '';
  if (
    state.kind === 'running' ||
    state.kind === 'quiet' ||
    state.kind === 'stalled'
  ) {
    const start =
      typeof (state as { startedAt?: number }).startedAt === 'number'
        ? (state as { startedAt: number }).startedAt
        : (now ?? Date.now)();
    time = fmtMs(Math.max(0, (now ?? Date.now)() - start));
  } else if (
    typeof (state as { durationMs?: number }).durationMs === 'number'
  ) {
    time = fmtMs(Math.max(0, (state as { durationMs: number }).durationMs));
  }
  // Output (only for terminal-result states)
  const wantsOut =
    state.kind === 'done' ||
    state.kind === 'warn' ||
    state.kind === 'error' ||
    state.kind === 'timedout' ||
    state.kind === 'cancelled' ||
    state.kind === 'killed';
  const output = wantsOut
    ? relOut(cwd, (state as { outputPath?: string }).outputPath)
    : '';
  return { label: label(k), time, output };
};
