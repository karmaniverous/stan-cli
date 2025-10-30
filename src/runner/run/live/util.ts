// src/stan/run/live/util.ts
import type { RowMeta, ScriptState } from '@/runner/run/types';

export const deriveMetaFromKey = (key: string): RowMeta | undefined => {
  if (key.startsWith('script:')) {
    return {
      type: 'script',
      item: key.slice('script:'.length) || '(unnamed)',
    };
  }
  if (key.startsWith('archive:')) {
    return {
      type: 'archive',
      item: key.slice('archive:'.length) || '(unnamed)',
    };
  }
  return undefined;
};

export const computeCounts = (
  rows: Iterable<{ state: ScriptState }>,
): {
  warn: number;
  waiting: number;
  running: number;
  quiet: number;
  stalled: number;
  ok: number;
  cancelled: number;
  fail: number;
  timeout: number;
} => {
  const c = {
    warn: 0,
    waiting: 0,
    running: 0,
    quiet: 0,
    stalled: 0,
    ok: 0,
    cancelled: 0,
    fail: 0,
    timeout: 0,
  };
  for (const { state: st } of rows) {
    if (st.kind === 'warn') c.warn += 1;
    else if (st.kind === 'waiting') c.waiting += 1;
    else if (st.kind === 'running') c.running += 1;
    else if (st.kind === 'quiet') c.quiet += 1;
    else if (st.kind === 'stalled') c.stalled += 1;
    else if (st.kind === 'done') c.ok += 1;
    else if (st.kind === 'timedout') c.timeout += 1;
    else if (st.kind === 'cancelled') c.cancelled += 1;
    else if (['error', 'killed'].includes(st.kind)) c.fail += 1;
  }
  return c;
};
