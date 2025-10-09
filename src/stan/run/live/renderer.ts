/* src/stan/run/live/renderer.ts
 * TTY live progress rendering (ProgressRenderer).
 * Decomposed: the frame string composition is in ./frame.ts.
 */
let __UI_COUNTER = 1;

import { type AnchoredWriter, createAnchoredWriter } from '@/anchored-writer';
import { liveTrace } from '@/stan/run/live/trace';

import { composeFrameBody } from './frame';
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
  private frameNo = 0;
  private timer?: NodeJS.Timeout;
  private startedAt = now();
  private writer: AnchoredWriter | null = null;
  private readonly uiId: number;

  constructor(args?: { boring?: boolean; refreshMs?: number }) {
    this.opts = {
      boring: Boolean(args?.boring),
      refreshMs: args?.refreshMs ?? 1000,
    };
    this.uiId = __UI_COUNTER++;
  }

  /** Reset the elapsed-time epoch (used on live restart). */
  public resetElapsed(): void {
    this.startedAt = now();
    this.frameNo = 0;
  }

  /**
   * Persist the final frame (no hint) and stop.
   * Stop interval first so no tick can overwrite the final frame.
   */
  public finalize(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;

    this.renderFinalNoHint();

    liveTrace.renderer.stop();
    liveTrace.renderer.done();
    this.writer?.done();
  }

  /** Force an immediate render of the current table state (no stop/clear). */
  public flush(): void {
    liveTrace.renderer.flush();
    this.render();
  }

  /** Drop all row state (restart bridge). */
  public resetRows(): void {
    this.rows.clear();
  }

  /** Start periodic rendering. */
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

  /**
   * Compose + write a final frame without the hint (leading/trailing blanks preserved).
   * Pad one extra newline so the line count matches the prior frame when the hint
   * is removed. This prevents a trailing CSI “clear” from becoming the final
   * character and guarantees the last byte is “\n” (required by tests),
   * without introducing the “walking down” effect between ticks.
   */
  private renderFinalNoHint(): void {
    let body = composeFrameBody({
      rows: Array.from(this.rows.values()),
      startedAt: this.startedAt,
      boring: this.opts.boring,
      uiId: this.uiId,
      includeHint: false,
    });
    // Ensure the final persisted frame ends with a newline even when the hint
    // line is removed (rows shrink). This keeps the last byte as "\n" while
    // avoiding per‑tick “walking”.
    if (!body.endsWith('\n')) body += '\n';
    body += '\n';
    this.writer?.write(body);
  }

  /** Compose + write a normal frame (includes the hint). */
  private render(): void {
    const body = composeFrameBody({
      rows: Array.from(this.rows.values()),
      startedAt: this.startedAt,
      boring: this.opts.boring,
      uiId: this.uiId,
      includeHint: true,
    });

    this.frameNo += 1;
    if (liveTrace.enabled) {
      try {
        // Keep basic debug info; detailed header/hint checks remain in composer.
        const counts = computeCounts(this.rows.values());
        const keys = Array.from(this.rows.keys()).slice(0, 5);
        liveTrace.renderer.render({
          frameNo: this.frameNo,
          rowsSize: this.rows.size,
          keys,
          headerCount: 1, // table composer emits exactly one header row
          hasHint: true,
          counts,
        });
      } catch {
        /* ignore */
      }
    }
    this.writer?.write(body);
  }
}
