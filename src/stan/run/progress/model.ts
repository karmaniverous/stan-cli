/* src/stan/run/progress/model.ts
 * A tiny evented model for run progress. Sinks (live/logger) subscribe to updates.
 */

export type RowMeta = { type: 'script' | 'archive'; item: string };

// Copy of the live renderer's ScriptState union (kept here to avoid a hard import cycle).
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

type Row = { meta: RowMeta; state: ScriptState };

export type ProgressListener = (e: {
  key: string;
  meta: RowMeta;
  state: ScriptState;
}) => void;

export class ProgressModel {
  private readonly rows = new Map<string, Row>();
  private readonly listeners = new Set<ProgressListener>();

  subscribe(fn: ProgressListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Drop all rows (used at session boundaries to avoid status carry‑over). */
  clearAll(): void {
    this.rows.clear();
    // No emit; callers will immediately re-queue rows for the next session.
  }

  /** Register or update a row. Emits a change event. */
  update(key: string, state: ScriptState, meta?: RowMeta): void {
    const prior = this.rows.get(key);
    const nextMeta = meta ?? prior?.meta;
    if (!nextMeta) {
      // Derive a minimal fallback when no meta is supplied; keep keys stable.
      const derived: RowMeta = key.startsWith('archive:')
        ? { type: 'archive', item: key.slice('archive:'.length) || '(unnamed)' }
        : { type: 'script', item: key.replace(/^script:/, '') || '(unnamed)' };
      this.rows.set(key, { meta: derived, state });
      this.emit(key, derived, state);
      return;
    }
    this.rows.set(key, { meta: nextMeta, state });
    this.emit(key, nextMeta, state);
  }

  private emit(key: string, meta: RowMeta, state: ScriptState): void {
    for (const fn of this.listeners) {
      try {
        fn({ key, meta, state });
      } catch {
        // best-effort
      }
    }
  }

  /** Snapshot counts for high-level summaries (optional utility). */
  counts(): {
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
    for (const [, row] of this.rows) {
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
