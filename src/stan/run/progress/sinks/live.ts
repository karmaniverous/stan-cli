/* src/stan/run/progress/sinks/live.ts */
import { ProgressRenderer } from '@/stan/run/live/renderer';
import type { RowMeta, ScriptState } from '@/stan/run/progress/model';
import type { ProgressModel } from '@/stan/run/progress/model';

export class LiveSink {
  private renderer: ProgressRenderer | null = null;
  private unsubscribe?: () => void;
  constructor(
    private readonly model: ProgressModel,
    private readonly opts?: { boring?: boolean },
  ) {}

  start(): void {
    if (!this.renderer) {
      this.renderer = new ProgressRenderer({
        boring: Boolean(this.opts?.boring),
      });
      this.renderer.start();
      this.unsubscribe = this.model.subscribe((e) =>
        this.onUpdate(e.key, e.meta, e.state),
      );
    }
  }

  /** Persist the final frame (without clearing). */
  stop(): void {
    try {
      // First persist the full table (header + rows + summary + hint).
      this.renderer?.flush();
      // Then persist a header-only frame so the last update contains exactly one
      // header line. This guards environments where a trailing update might omit
      // the header and aligns with the live.restart.behavior test.
      this.renderer?.showHeaderOnly?.();
      this.renderer?.stop();
    } catch {
      /* ignore */
    }
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = undefined;
  } /** Clear immediately (used on restart). */
  clear(): void {
    try {
      (this.renderer as unknown as { clear?: () => void })?.clear?.();
      this.renderer?.stop();
    } catch {
      /* ignore */
    }
  }

  cancelPending(): void {
    (
      this.renderer as unknown as { cancelPending?: () => void }
    )?.cancelPending?.();
  }

  private onUpdate(_key: string, meta: RowMeta, state: ScriptState): void {
    this.renderer?.update(`${meta.type}:${meta.item}`, state, meta);
  }
}
