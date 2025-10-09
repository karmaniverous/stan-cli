/* src/stan/run/progress/sinks/live.ts */
import { ProgressRenderer } from '@/stan/run/live/renderer';
import type { RowMeta, ScriptState } from '@/stan/run/progress/model';
import type { ProgressModel } from '@/stan/run/progress/model';

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
  stop(opts?: { headerOnly?: boolean }): void {
    // Idempotent: no-op on late/double stops (e.g., exit hook after manual cancel).
    if (this.stopped) {
      this.dbg('stop():already-stopped');
      return;
    }
    this.stopped = true;

    try {
      // Final-frame policy:
      // - Normal completion (default): persist the final full table (rows + summary + hint).
      // - Cancellation/restart bridge: when headerOnly=true, persist a header-only frame (with hint).
      if (opts?.headerOnly) {
        this.dbg('stop() header-only+done');
        try {
          (
            this.renderer as unknown as { showHeaderOnly?: () => void }
          )?.showHeaderOnly?.();
        } catch {
          /* ignore */
        }
      } else {
        this.dbg('stop() flush+done');
        try {
          this.renderer?.flush();
        } catch {
          /* ignore */
        }
      }
      this.renderer?.stop();
    } catch {
      /* ignore */
    }
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = undefined;
  }

  /** Force an immediate render of the current table state (no stop/clear). */
  flushNow(): void {
    try {
      this.renderer?.flush();
    } catch {
      /* ignore */
    }
  }

  /** Render a deterministic header-only frame (includes the hint). */
  showHeaderOnly(): void {
    try {
      (
        this.renderer as unknown as { showHeaderOnly?: () => void }
      )?.showHeaderOnly?.();
    } catch {
      /* ignore */
    }
  }

  /** Clear immediately (used on restart). */
  clear(): void {
    try {
      this.dbg('clear()');
      (this.renderer as unknown as { clear?: () => void })?.clear?.();
      this.renderer?.stop();
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
