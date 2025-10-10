/* src/stan/run/progress/sinks/live.ts */
import { ProgressRenderer } from '@/stan/run/live/renderer';
import type { ProgressModel } from '@/stan/run/progress/model';
import type { RowMeta, ScriptState } from '@/stan/run/types';

export class LiveSink {
  private dbg(...args: unknown[]): void {
    try {
      if (process.env.STAN_LIVE_DEBUG === '1') {
        console.error('[stan:live:sink]', ...args);
      }
    } catch {
      /* ignore */
    }
  }
  private renderer: ProgressRenderer | null = null;
  private unsubscribe?: () => void;
  /** Idempotency guard for stop(). */
  private stopped = false;

  constructor(
    private readonly model: ProgressModel,
    private readonly opts?: { boring?: boolean },
  ) {}

  start(): void {
    // Reset idempotency guard on each (re)start.
    this.stopped = false;

    if (!this.renderer) {
      this.dbg('start() renderer=create');
      this.renderer = new ProgressRenderer({
        boring: Boolean(this.opts?.boring),
      });
      this.renderer.start();
      this.unsubscribe = this.model.subscribe((e) =>
        this.onUpdate(e.key, e.meta, e.state),
      );
    } else this.dbg('start() renderer=existing');
  }

  /** Persist the final frame (without clearing). */
  stop(): void {
    // Idempotent: no-op on late/double stops (e.g., exit hook after manual cancel).
    if (this.stopped) {
      this.dbg('stop():already-stopped');
      return;
    }
    this.stopped = true;

    try {
      const r = this.renderer as unknown as { finalize?: () => void };
      // Always finalize full; renderer will suppress hint for the final frame.
      if (typeof r?.finalize === 'function') {
        this.dbg('stop() finalize(full)');
        r.finalize?.();
      }
    } catch {
      /* ignore */
    }
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = undefined;
  } /** Force an immediate render of the current table state (no stop/clear). */
  flushNow(): void {
    try {
      this.renderer?.flush();
    } catch {
      /* ignore */
    }
  }

  /** Restart bridge: drop prior rows so the next full table reflects the new session only. */
  resetForRestart(): void {
    try {
      this.dbg('resetForRestart()');
      (this.renderer as unknown as { resetRows?: () => void })?.resetRows?.();
    } catch {
      /* ignore */
    }
  }
  /** Reset elapsed-time epoch for summary timer on restart. */
  resetElapsed(): void {
    try {
      (
        this.renderer as unknown as { resetElapsed?: () => void }
      )?.resetElapsed?.();
    } catch {
      /* ignore */
    }
  }

  cancelPending(): void {
    this.dbg('cancelPending()');
    (
      this.renderer as unknown as { cancelPending?: () => void }
    )?.cancelPending?.();
  }

  private onUpdate(_key: string, meta: RowMeta, state: ScriptState): void {
    this.dbg('update', {
      key: _key,
      type: meta.type,
      item: meta.item,
      kind: state.kind,
    });
    this.renderer?.update(`${meta.type}:${meta.item}`, state, meta);
  }
}
