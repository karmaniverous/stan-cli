/* src/stan/run/progress/model.ts
 * A tiny evented model for run progress. Sinks (live/logger) subscribe to updates.
 */

import { computeCounts, deriveMetaFromKey } from '@/runner/run/live/util';
import type { RowMeta, ScriptState } from '@/runner/run/types';

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
      // Prefer shared derivation; if it fails, fallback to a minimal guess.
      const derivedMaybe = deriveMetaFromKey(key);
      const derived: RowMeta =
        derivedMaybe ??
        (key.startsWith('archive:')
          ? {
              type: 'archive',
              item: key.slice('archive:'.length) || '(unnamed)',
            }
          : {
              type: 'script',
              item: key.replace(/^script:/, '') || '(unnamed)',
            });
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
    // Reuse the UI utility (pure) to avoid double-maintaining state counts here.
    return computeCounts(
      Array.from(this.rows.values()).map((r) => ({ state: r.state })),
    );
  }
}
