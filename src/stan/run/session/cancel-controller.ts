// src/stan/run/session/cancel-controller.ts
import type { ProcessSupervisor } from '@/stan/run/live/supervisor';
import { liveTrace } from '@/stan/run/live/trace';
import type { RunnerUI } from '@/stan/run/ui';

export class CancelController {
  private cancelled = false;
  private restartRequested = false;
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
  public isRestart(): boolean {
    return this.restartRequested;
  }
  public wasKeyCancelled(key: string): boolean {
    return this.cancelled && this.cancelledKeys.has(`script:${key}`);
  }

  public triggerCancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    try {
      this.ui.onCancelled('cancel');
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

  public triggerRestart(): void {
    if (this.restartRequested) return;
    this.restartRequested = true;
    this.cancelled = true;
    try {
      this.ui.onCancelled('restart');
    } catch {
      /* ignore */
    }
    try {
      this.supervisor.cancelAll({ immediate: true });
    } catch {
      /* ignore */
    }
    try {
      this.wake?.();
    } catch {
      /* ignore */
    }
  }

  public detachUiKeys(): void {
    try {
      liveTrace.session.info('restart: detach keys');
      // RunnerUI is responsible for detaching raw-mode handlers via stop/onCancelled.
      // No-op here — LiveUI handles control.detach() internally.
    } catch {
      /* ignore */
    }
  }
}
