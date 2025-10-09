/* src/stan/run/live/renderer.ts
 * TTY live progress rendering (ProgressRenderer).
 */
let __UI_COUNTER = 1;

import { type AnchoredWriter, createAnchoredWriter } from '@/anchored-writer';
import { liveTrace } from '@/stan/run/live/trace';
import { renderSummary } from '@/stan/run/summary';

import { label } from '../labels';
import { bodyTable, fmtMs, headerCells, hintLine, stripAnsi } from './format';
import type { RowMeta, ScriptState } from './types';
import { computeCounts, deriveMetaFromKey } from './util';

type InternalState = ScriptState & { outputPath?: string };
type Row = RowMeta & { state: InternalState };
const now = (): number => Date.now();

export class ProgressRenderer {
  private readonly rows = new Map<string, Row>();
  private readonly opts: {
    boring: boolean;
    refreshMs: number;
  };
  // Monotonic frame counter for correlation
  private frameNo = 0;
  private timer?: NodeJS.Timeout;
  private readonly startedAt = now();
  /** Anchored writer (per-line clears; no alt-screen; hides cursor). */
  private writer: AnchoredWriter | null = null;
  // Test-only: stable instance tag for restart-dedup tests (enabled when STAN_TEST_UI_TAG=1)
  private readonly uiId: number;
  constructor(args?: { boring?: boolean; refreshMs?: number }) {
    this.opts = {
      boring: Boolean(args?.boring),
      refreshMs: args?.refreshMs ?? 1000,
    };
    this.uiId = __UI_COUNTER++;
  }

  /**
   * Atomically persist the final frame:
   * - stop the interval,
   * - render the selected final body,
   * - and signal done().
   * Prevents a timer tick from interleaving with the last render.
   */
  public finalize(): void {
    // Stop interval first so no tick can overwrite the final frame.
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;

    // Always persist the final table; UI no longer uses header-only bridges.
    // Suppress hint in the final frame per requirements.
    this.renderFinalNoHint();
    // Mark done.
    liveTrace.renderer.stop();
    liveTrace.renderer.done();
    this.writer?.done();
  }

  /** Render one final frame (no stop/persist). */ public flush(): void {
    liveTrace.renderer.flush();
    // Paint now to show current state...
    this.render();
  }

  /** Drop all row state (restart bridge). */
  public resetRows(): void {
    this.rows.clear();
  }

  // Compose and write a final frame without the hint line (leading/trailing blanks preserved).
  private renderFinalNoHint(): void {
    const header = headerCells();
    const rows: string[][] = [];
    rows.push(header);
    if (this.rows.size === 0) {
      const elapsed = fmtMs(now() - this.startedAt);
      rows.push(['—', '—', this.opts.boring ? '[IDLE]' : 'idle', elapsed, '']);
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
          time = fmtMs(now() - (st as { startedAt: number }).startedAt);
        } else if (
          'durationMs' in st &&
          typeof (st as { durationMs?: number }).durationMs === 'number'
        ) {
          time = fmtMs((st as { durationMs: number }).durationMs);
        }
        const out =
          st.kind === 'done' ||
          st.kind === 'error' ||
          st.kind === 'timedout' ||
          st.kind === 'cancelled' ||
          st.kind === 'killed'
            ? (st.outputPath ?? '')
            : '';
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
    const tableStr = bodyTable(rows);
    const strippedTable = tableStr
      .split('\n')
      .map((l) => (l.startsWith(' ') ? l.slice(1) : l))
      .join('\n');
    const elapsed = fmtMs(now() - this.startedAt);
    const counts = computeCounts(this.rows.values());
    const summary = renderSummary(elapsed, counts, this.opts.boring);
    const raw = `${strippedTable.trimEnd()}\n\n${summary}`;
    const body = `\n${raw}\n \n`; // leading + trailing blank/pad
    this.writer?.write(body);
  }

  /** (Retained for completeness; UI no longer calls this.) */
  public showHeaderOnly(): void {
    // Render header without rows (header-only), then persist with hint (legacy path, not used).
    liveTrace.renderer.headerOnly({});
    this.frameNo += 1;
    const header = headerCells();
    const stripped = bodyTable([header])
      .split('\n')
      .map((l) => (l.startsWith(' ') ? l.slice(1) : l))
      .join('\n')
      .trimEnd();
    // Footer: summary + hint (adjacent), matching the regular render shape.
    const elapsed = fmtMs(now() - this.startedAt);
    const counts = computeCounts(this.rows.values());
    const summary = renderSummary(elapsed, counts, this.opts.boring);
    const hint = hintLine(this.uiId);

    // Safety pad (single space) line after the hint to absorb terminal over-clear.
    const body = `\n${stripped}\n\n${summary}\n${hint}\n \n`;

    // ANSI-safe debug summary for this header-only frame
    if (liveTrace.enabled) {
      try {
        const plain = stripAnsi(body);
        const headerRe =
          /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output(?:\n|$)/g;
        const headerCount = (plain.match(headerRe) ?? []).length;
        const hasHint = /Press q to cancel,\s*r to restart/.test(plain);
        liveTrace.renderer.headerOnly({
          frameNo: this.frameNo,
          headerCount,
          hasHint,
        });
      } catch {
        /* ignore */
      }
    }
    this.writer?.write(body);
  }

  start(): void {
    liveTrace.renderer.start({ refreshMs: this.opts.refreshMs });
    if (this.timer) return;
    if (!this.writer) this.writer = createAnchoredWriter();
    this.writer.start();
    this.timer = setInterval(() => this.render(), this.opts.refreshMs);
  }
  /** Clear any rendered output without persisting it. */
  public clear(): void {
    liveTrace.renderer.clear();
    this.writer?.clear();
  }

  stop(): void {
    liveTrace.renderer.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    liveTrace.renderer.done();
    this.writer?.done();
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
      deriveMetaFromKey(key) ??
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
    liveTrace.renderer.update({
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
          this.update(key, { kind: 'cancelled' });
          break;
        }
        case 'running':
        case 'quiet':
        case 'stalled': {
          const started =
            typeof (st as { startedAt?: number }).startedAt === 'number'
              ? (st as { startedAt: number }).startedAt
              : undefined;
          const dur =
            typeof started === 'number' ? Math.max(0, t - started) : 0;
          this.update(key, { kind: 'cancelled', durationMs: dur });
          break;
        }
        default:
          break;
      }
    }
  }

  private render(): void {
    const header = headerCells();
    const rows: string[][] = [];
    rows.push(header);
    if (this.rows.size === 0) {
      const elapsed = fmtMs(now() - this.startedAt);
      rows.push(['—', '—', this.opts.boring ? '[IDLE]' : 'idle', elapsed, '']);
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

    const tableStr = bodyTable(rows);

    const strippedTable = tableStr
      .split('\n')
      .map((l) => (l.startsWith(' ') ? l.slice(1) : l))
      .join('\n');

    const elapsed = fmtMs(now() - this.startedAt);
    const counts = computeCounts(this.rows.values());
    const summary = renderSummary(elapsed, counts, this.opts.boring);
    const hint = hintLine(this.uiId);
    const raw = `${strippedTable.trimEnd()}\n\n${summary}\n${hint}`;
    // Safety pad: keep a non-empty blank line below the hint so the terminal
    // cannot clip the hint when repainting/clearing.
    const body = `\n${raw}\n \n`;
    this.frameNo += 1;
    if (liveTrace.enabled) {
      try {
        const plain = stripAnsi(body);
        const headerRe =
          /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output(?:\n|$)/g;
        const headerMatches = (plain.match(headerRe) ?? []).length;
        const hasHint = /Press q to cancel,\s*r to restart/.test(plain);
        const keys = Array.from(this.rows.keys()).slice(0, 5);
        liveTrace.renderer.render({
          frameNo: this.frameNo,
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
    this.writer?.write(body);
  }
}
