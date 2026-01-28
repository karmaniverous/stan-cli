// src/stan/run/session/cancel-controller.ts
import type { ProcessSupervisor } from '@/runner/run/live/supervisor';
import type { RunnerUI } from '@/runner/run/ui';

export class CancelController {
  private cancelled = false;
  private cancelledKeys = new Set<string>();
  private wake: (() => void) | null = null;
  private waitP: Promise<void>;

  constructor(
    private readonly ui: RunnerUI,
    private readonly supervisor: ProcessSupervisor,
  ) {
    this.waitP = new Promise<void>((r) => (this.wake = r));
  }

  public markQueued(keys: string[]): void {
    for (const k of keys) this.cancelledKeys.add(`script:${k}`);
  }

  public async wait(): Promise<void> {
    await this.waitP;
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }
  public wasKeyCancelled(key: string): boolean {
    return this.cancelled && this.cancelledKeys.has(`script:${key}`);
  }

  public triggerCancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    try {
      this.ui.onCancelled();
    } catch {
      /* ignore */
    }
    try {
      this.supervisor.cancelAll({ immediate: true });
    } catch {
      /* ignore */
    }
    try {
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') process.exit(1);
    } catch {
      /* ignore */
    }
    try {
      this.wake?.();
    } catch {
      /* ignore */
    }
  }
}
