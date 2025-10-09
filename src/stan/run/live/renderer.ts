/* src/stan/run/live/renderer.ts
 * TTY live progress rendering (ProgressRenderer).
 */
let __UI_COUNTER = 1;

import logUpdate from 'log-update';
import { table } from 'table';

import { renderSummary } from '@/stan/run/summary';
import { bold, dim } from '@/stan/util/color';

import { label } from '../labels';

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

type InternalState = ScriptState & { outputPath?: string };

type RowMeta = { type: 'script' | 'archive'; item: string };
type Row = RowMeta & { state: InternalState };

const now = (): number => Date.now();
const pad2 = (n: number): string => n.toString().padStart(2, '0');
const fmtMs = (ms: number): string => {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
};

export class ProgressRenderer {
  private readonly rows = new Map<string, Row>();
  private readonly opts: {
    boring: boolean;
    refreshMs: number;
  };
  private dbg(...args: unknown[]): void {
    try {
      if (process.env.STAN_LIVE_DEBUG === '1') {
        console.error('[stan:live:renderer]', ...args);
      }
    } catch {
      // ignore
    }
  }
  private timer?: NodeJS.Timeout;
  private readonly startedAt = now();
  // Test-only: stable instance tag for restart-dedup tests (enabled when STAN_TEST_UI_TAG=1)
  private readonly uiId: number;
  constructor(args?: { boring?: boolean; refreshMs?: number }) {
    this.opts = {
      boring: Boolean(args?.boring),
      refreshMs: args?.refreshMs ?? 1000,
    };
    this.uiId = __UI_COUNTER++;
  }
  /** Render one final frame (no stop/persist). */
  public flush(): void {
    this.dbg('flush()');
    this.render();
  }
  /**
   * Render only the header row and persist it (no idle row, no summary/hint).
   * Useful for live restarts to keep the table scaffolding in place.
   */
  public showHeaderOnly(): void {
    this.dbg('showHeaderOnly()');
    const header = ['Type', 'Item', 'Status', 'Time', 'Output'].map((h) =>
      bold(h),
    );
    const bodyTable = table([header], {
      border: {
        topBody: ``,
        topJoin: ``,
        topLeft: ``,
        topRight: ``,
        bottomBody: ``,
        bottomJoin: ``,
        bottomLeft: ``,
        bottomRight: ``,
        bodyLeft: ``,
        bodyRight: ``,
        bodyJoin: ``,
        joinBody: ``,
        joinLeft: ``,
        joinRight: ``,
        joinJoin: ``,
      },
      drawHorizontalLine: () => false,
    });
    const stripped = bodyTable
      .split('\n')
      .map((l) => (l.startsWith(' ') ? l.slice(1) : l))
      .join('\n')
      .trimEnd();
    // Include the hint so the final persisted frame carries instructions as well.
    const tag =
      process.env.STAN_TEST_UI_TAG === '1' ? ` UI#${this.uiId.toString()}` : '';
    const hint = `${dim('Press')} ${bold('q')} ${dim('to cancel,')} ${bold(
      'r',
    )} ${dim('to restart')}${tag}`;
    const body = `\n${stripped}\n\n${hint}`;
    try {
      logUpdate(body);
    } catch {
      /* best-effort */
    }
  }
  start(): void {
    this.dbg('start()', { refreshMs: this.opts.refreshMs });
    if (this.timer) return;
    this.timer = setInterval(() => this.render(), this.opts.refreshMs);
  }
  /** Clear any rendered output without persisting it. */
  public clear(): void {
    this.dbg('clear()');
    try {
      (logUpdate as unknown as { clear?: () => void }).clear?.();
    } catch {
      // best-effort
    }
  }

  stop(): void {
    this.dbg('stop()');
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.dbg('stop():done()');
    try {
      (logUpdate as unknown as { done?: () => void }).done?.();
    } catch {
      // best-effort
    }
  }
  /**
   * Update a row by stable key. Optional meta lets callers register type/item explicitly.
   * Keys:
   *  - scripts:  "script:<name>"
   *  - archives: "archive:full", "archive:diff"
   */
  update(key: string, state: ScriptState, meta?: RowMeta): void {
    const prior = this.rows.get(key);
    const resolvedMeta =
      meta ??
      this.deriveMetaFromKey(key) ??
      (prior?.type
        ? ({ type: prior.type, item: prior.item } as RowMeta)
        : undefined);
    if (!resolvedMeta) {
      const fallback: RowMeta = { type: 'script', item: key };
      this.rows.set(key, {
        ...fallback,
        state: { ...(prior?.state ?? {}), ...state },
      });
      return;
    }
    this.rows.set(key, {
      ...resolvedMeta,
      state: { ...(prior?.state ?? {}), ...state },
    });
    this.dbg('update()', {
      key,
      kind: state.kind,
      rowsSize: this.rows.size,
    });
  }
  /**
   * Mark all non‑final rows as "cancelled", preserving final values for rows
   * that are already completed (done/error/timedout/killed). For in‑flight rows,
   * compute a final duration at the moment of cancellation.
   */
  public cancelPending(): void {
    const t = now();
    for (const [key, row] of this.rows.entries()) {
      const st = row.state;
      switch (st.kind) {
        case 'waiting': {
          // Never started: mark as cancelled with NO duration so the Time column renders blank.
          // This avoids misleading “00:00” for items that were never run.
          this.update(key, { kind: 'cancelled' });
          break;
        }
        case 'running':
        case 'quiet':
        case 'stalled': {
          // Finalize duration from startedAt; preserve any existing outputPath
          const started =
            typeof (st as { startedAt?: number }).startedAt === 'number'
              ? (st as { startedAt: number }).startedAt
              : undefined;
          const dur =
            typeof started === 'number' ? Math.max(0, t - started) : 0;
          this.update(key, { kind: 'cancelled', durationMs: dur });
          break;
        }
        // Leave rows that already carry a terminal status untouched so their final
        // state, durations, and output paths remain visible.
        default:
          break;
      }
    }
  }

  private deriveMetaFromKey(key: string): RowMeta | undefined {
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
  }

  private render(): void {
    const header = ['Type', 'Item', 'Status', 'Time', 'Output'].map((h) =>
      bold(h),
    );

    const rows: string[][] = [];
    rows.push(header);
    if (this.rows.size === 0) {
      const elapsed = fmtMs(now() - this.startedAt);
      rows.push([
        dim('—'),
        dim('—'),
        dim(this.opts.boring ? '[IDLE]' : 'idle'),
        dim(elapsed),
        dim(''),
      ]);
    } else {
      const all = Array.from(this.rows.values());
      const grouped = [
        ...all.filter((r) => r.type === 'script'),
        ...all.filter((r) => r.type === 'archive'),
      ];
      for (const row of grouped) {
        const st = row.state;
        let time = '';
        if (
          st.kind === 'running' ||
          st.kind === 'quiet' ||
          st.kind === 'stalled'
        ) {
          time = fmtMs(now() - st.startedAt);
        } else if (
          'durationMs' in st &&
          typeof (st as { durationMs?: number }).durationMs === 'number'
        ) {
          time = fmtMs((st as { durationMs: number }).durationMs);
        } else {
          time = '';
        }

        const out =
          st.kind === 'done' ||
          st.kind === 'error' ||
          st.kind === 'timedout' ||
          st.kind === 'cancelled' ||
          st.kind === 'killed'
            ? (st.outputPath ?? '')
            : '';

        // Map internal state to shared StatusKind
        const kind =
          st.kind === 'warn'
            ? 'warn'
            : st.kind === 'waiting'
              ? 'waiting'
              : st.kind === 'running'
                ? 'run'
                : st.kind === 'quiet'
                  ? 'quiet'
                  : st.kind === 'stalled'
                    ? 'stalled'
                    : st.kind === 'done'
                      ? 'ok'
                      : st.kind === 'error'
                        ? 'error'
                        : st.kind === 'timedout'
                          ? 'timeout'
                          : st.kind === 'cancelled'
                            ? 'cancelled'
                            : 'killed';
        rows.push([row.type, row.item, label(kind), time, out ?? '']);
      }
    }

    const bodyTable = table(rows, {
      border: {
        topBody: ``,
        topJoin: ``,
        topLeft: ``,
        topRight: ``,
        bottomBody: ``,
        bottomJoin: ``,
        bottomLeft: ``,
        bottomRight: ``,
        bodyLeft: ``,
        bodyRight: ``,
        bodyJoin: ``,
        joinBody: ``,
        joinLeft: ``,
        joinRight: ``,
        joinJoin: ``,
      },
      drawHorizontalLine: () => false,
      columns: {
        2: { alignment: 'left' },
        3: { alignment: 'right' },
      },
    });

    const strippedTable = bodyTable
      .split('\n')
      .map((l) => (l.startsWith(' ') ? l.slice(1) : l))
      .join('\n');

    const elapsed = fmtMs(now() - this.startedAt);
    const counts = this.counts();
    const summary = renderSummary(elapsed, counts, this.opts.boring);
    // Test-only UI tag (appears when STAN_TEST_UI_TAG=1); harmless in non-test runs.
    const tag =
      process.env.STAN_TEST_UI_TAG === '1' ? ` UI#${this.uiId.toString()}` : '';
    const hint = `${dim('Press')} ${bold('q')} ${dim('to cancel,')} ${bold(
      'r',
    )} ${dim('to restart')}${tag}`;
    // We append the tag to the hint line only to avoid perturbing table layout in normal frames.
    const raw = `${strippedTable.trimEnd()}\n\n${summary}\n${hint}`;
    // Add a leading blank line and remove global left indent
    const body = `\n${raw}`;
    if (process.env.STAN_LIVE_DEBUG === '1') {
      try {
        const headerRe =
          /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output(?:\n|$)/g;
        const headerMatches = (body.match(headerRe) ?? []).length;
        const hasHint = /Press q to cancel,\s*r to restart/.test(body);
        const keys = Array.from(this.rows.keys()).slice(0, 5);
        this.dbg('render()', {
          rowsSize: this.rows.size,
          keys,
          headerCount: headerMatches,
          hasHint,
          counts,
        });
      } catch {
        /* ignore */
      }
    }
    try {
      logUpdate(body);
    } catch {
      // best-effort
    }
  }
  private counts(): {
    warn: number;
    waiting: number;
    running: number;
    quiet: number;
    stalled: number;
    ok: number;
    cancelled: number;
    fail: number;
    timeout: number;
  } {
    let warn = 0;
    let waiting = 0;
    let running = 0;
    let quiet = 0;
    let stalled = 0;
    let ok = 0;
    let cancelled = 0;
    let fail = 0;
    let timeout = 0;
    for (const [, row] of this.rows.entries()) {
      const st = row.state;
      switch (st.kind) {
        case 'warn':
          warn += 1;
          break;
        case 'waiting':
          waiting += 1;
          break;
        case 'running':
          running += 1;
          break;
        case 'quiet':
          quiet += 1;
          break;
        case 'stalled':
          stalled += 1;
          break;
        case 'done':
          ok += 1;
          break;
        case 'timedout':
          timeout += 1;
          break;
        case 'cancelled':
          cancelled += 1;
          break;
        case 'error':
        case 'killed':
          fail += 1;
          break;
        default:
          break;
      }
    }
    return {
      warn,
      waiting,
      running,
      quiet,
      stalled,
      ok,
      cancelled,
      fail,
      timeout,
    };
  }
}
