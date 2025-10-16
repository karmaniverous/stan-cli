/* src/runner/run/progress/sinks/base.ts
 * Minimal base for progress sinks:
 * - Centralizes ProgressModel subscribe/unsubscribe lifecycle.
 * - Subclasses provide onUpdate(key, meta, state).
 */
import type { ProgressModel } from '@/runner/run/progress/model';
import type { RowMeta, ScriptState } from '@/runner/run/types';

export abstract class BaseSink {
  protected constructor(protected readonly model: ProgressModel) {}

  private unsub?: () => void;

  /** Idempotent subscribe to the model; dispatches to subclass onUpdate. */
  protected subscribeModel(): void {
    if (this.unsub) return;
    this.unsub = this.model.subscribe((e) => {
      try {
        this.onUpdate(e.key, e.meta, e.state);
      } catch {
        /* ignore sink update errors */
      }
    });
  }

  /** Idempotent unsubscribe from the model. */
  protected unsubscribeModel(): void {
    try {
      this.unsub?.();
    } catch {
      /* ignore */
    }
    this.unsub = undefined;
  }

  /** Subclasses implement row handling for progress updates. */
  protected abstract onUpdate(
    key: string,
    meta: RowMeta,
    state: ScriptState,
  ): void;
}
