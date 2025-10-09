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
  constructor(
    private readonly model: ProgressModel,
    private readonly opts?: { boring?: boolean },
  ) {}

  start(): void {
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
    try {
      this.dbg('stop() flush+done');
      // Persist the full table (header + rows + summary + hint).
      this.renderer?.flush();
      this.renderer?.stop();
    } catch {
      /* ignore */
    }
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = undefined;
  } /** Clear immediately (used on restart). */
  clear(): void {
    try {
      this.dbg('clear()');
      (this.renderer as unknown as { clear?: () => void })?.clear?.();
      this.renderer?.stop();
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
