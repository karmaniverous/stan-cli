/* src/stan/run/labels.ts
 * Shared BORING/TTY-aware status label helper for Logger and Live UIs.
 */
import { alert, cancel, error, go, ok, stop, warn } from '@/stan/util/color';

export type StatusKind =
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

// BORING detection mirrors other UI helpers so Live/Logger remain consistent.
const isTTY = Boolean(
  (process.stdout as unknown as { isTTY?: boolean })?.isTTY,
);
const isBoring = (): boolean =>
  process.env.STAN_BORING === '1' ||
  process.env.NO_COLOR === '1' ||
  process.env.FORCE_COLOR === '0' ||
  !isTTY;

/**
 * Render a status label suitable for table/log rows.
 * Honors BORING/TTY via util/color.
 */
export const label = (kind: StatusKind): string => {
  if (isBoring()) {
    // Bracketed tokens for BORING/non‑TTY to match Logger parity and tests.
    if (kind === 'warn') {
      return '[WARN]';
    }
    switch (kind) {
      case 'waiting':
        return '[WAIT]';
      case 'run':
        return '[RUN]';
      case 'ok':
        return '[OK]';
      case 'error':
        return '[FAIL]';
      case 'cancelled':
        return '[CANCELLED]';
      case 'timeout':
        return '[TIMEOUT]';
      case 'quiet':
        return '[QUIET]';
      case 'stalled':
        return '[STALLED]';
      case 'killed':
        return '[KILLED]';
      default:
        return '';
    }
  }
  switch (kind) {
    case 'warn':
      return warn('⚠ warn');
    case 'waiting':
      return cancel('⏸ waiting');
    case 'run':
      return go('▶ run');
    case 'ok':
      return ok('✔ ok');
    case 'error':
      return error('✖ fail');
    case 'cancelled':
      return stop('◼ cancelled');
    case 'timeout':
      return error('⏱ timeout');
    case 'quiet':
      return alert('⏱ quiet');
    case 'stalled':
      return warn('⏱ stalled');
    case 'killed':
      return error('◼ killed');
    default:
      return '';
  }
};
