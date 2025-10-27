/* src/stan/run/summary.ts
 * Shared BORING/TTY-aware summary line helper for progress tables/logs.
 */
import { alert, cancel, error, go, ok, stop, warn } from '@/runner/util/color';

export type SummaryCounts = {
  warn: number;
  waiting: number;
  running: number;
  quiet: number;
  stalled: number;
  ok: number;
  cancelled: number;
  fail: number;
  timeout: number;
};

export const renderSummary = (
  elapsed: string,
  counts: SummaryCounts,
  boring: boolean,
): string => {
  const sep = ' • ';
  if (boring) {
    return [
      elapsed,
      `waiting ${counts.waiting.toString()}`,
      `running ${counts.running.toString()}`,
      `quiet ${counts.quiet.toString()}`,
      `stalled ${counts.stalled.toString()}`,
      `timeout ${counts.timeout.toString()}`,
      `ok ${counts.ok.toString()}`,
      `warn ${counts.warn.toString()}`,
      `fail ${counts.fail.toString()}`,
      `cancelled ${counts.cancelled.toString()}`,
    ].join(sep);
  }
  return [
    elapsed,
    cancel(`⏸︎ ${counts.waiting.toString()}`),
    go(`▶︎ ${counts.running.toString()}`),
    alert(`⏱︎ ${counts.quiet.toString()}`),
    warn(`⏱︎ ${counts.stalled.toString()}`),
    error(`⏱︎ ${counts.timeout.toString()}`),
    ok(`✔︎ ${counts.ok.toString()}`),
    warn(`⚠︎ ${counts.warn.toString()}`),
    error(`✖︎ ${counts.fail.toString()}`),
    stop(`◼︎ ${counts.cancelled.toString()}`),
  ].join(sep);
};
