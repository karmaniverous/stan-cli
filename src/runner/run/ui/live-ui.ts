// src/stan/run/ui/live-ui.ts

import { RunnerControl } from '@/runner/run/control';
import { liveTrace, ProgressRenderer } from '@/runner/run/live';
import { LiveSink, ProgressModel } from '@/runner/run/progress';
import { createUiEndForwarders } from '@/runner/run/ui/forward';

import {
  queueArchive,
  queueScript,
  startArchive,
  startScript,
} from './lifecycle';
import type { ArchiveKind, RunnerUI } from './types';

export class LiveUI implements RunnerUI {
  private renderer: ProgressRenderer | null = null;
  private control: RunnerControl | null = null;
  private readonly model = new ProgressModel();
  private readonly sink: LiveSink;
  private forwards = createUiEndForwarders(this.model, { useDurations: true });
  /** Idempotency guard for stop(). */
  private stopped = false;

  constructor(private readonly opts?: { boring?: boolean }) {
    this.sink = new LiveSink(this.model, { boring: Boolean(opts?.boring) });
  }

  start(): void {
    liveTrace.ui.start();
    // Reset idempotency guard on each session start.
    this.stopped = false;
    if (!this.renderer) {
      this.sink.start();
      // Keep a renderer reference only for cancel/clear calls routed via sink.
      this.renderer =
        (this.sink as unknown as { renderer?: ProgressRenderer }).renderer ??
        null;
    }
  }
  onPlan(planBody: string): void {
    console.log(planBody);
  }
  onScriptQueued(key: string): void {
    queueScript(this.model, key);
  }
  onScriptStart(key: string): void {
    startScript(this.model, key);
  }
  onScriptEnd(
    key: string,
    outAbs: string,
    cwd: string,
    startedAt: number,
    endedAt: number,
    exitCode?: number,
    status?: 'ok' | 'warn' | 'error',
  ): void {
    this.forwards.onScriptEnd(
      key,
      outAbs,
      cwd,
      startedAt,
      endedAt,
      exitCode,
      status,
    );
  }
  onArchiveQueued(kind: ArchiveKind): void {
    queueArchive(this.model, kind);
  }
  onArchiveStart(kind: ArchiveKind): void {
    startArchive(this.model, kind);
  }
  onArchiveEnd(
    kind: ArchiveKind,
    outAbs: string,
    cwd: string,
    startedAt: number,
    endedAt: number,
  ): void {
    this.forwards.onArchiveEnd(kind, outAbs, cwd, startedAt, endedAt);
  }
  /**
   * Tear down live rendering on cancellation.
   * - mode === 'cancel': persist the final table (hint hidden by renderer on finalize).
   * - mode === 'restart': paint CANCELLED immediately and leave table visible for overwrite.
   */
  onCancelled(mode: 'cancel' | 'restart' = 'cancel'): void {
    liveTrace.ui.onCancelled(mode);
    try {
      this.sink.cancelPending();
    } catch {
      /* ignore */
    }
    // Reset elapsed timer for a subsequent restart session.
    try {
      this.sink.resetElapsed();
    } catch {
      /* ignore */
    }
    try {
      if (mode === 'restart') {
        liveTrace.session.info(
          'restart: paint CANCELLED immediately; detach keys; table remains for overwrite',
        );
        // Force an immediate render so CANCELLED appears between restart and next session.
        try {
          this.sink.flushNow();
        } catch {
          /* ignore */
        }
        try {
          const ctl = this.control;
          if (ctl) ctl.detach();
        } catch {
          /* ignore */
        } finally {
          this.control = null;
        }
      } else {
        liveTrace.ui.stop();
        // Persist final table; renderer will hide the hint on finalize.
        this.sink.stop();
      }
    } catch {
      /* ignore */
    }
    try {
      const ctl = this.control;
      if (ctl) ctl.detach();
    } catch {
      /* ignore */
    } finally {
      this.control = null;
    }
  }
  /** Called just before queueing rows for a new session to remove cancelled carryover. */
  prepareForNewSession(): void {
    try {
      // Drop any prior model state so the next session displays only fresh rows.
      this.model.clearAll();
    } catch {
      /* ignore */
    }
    try {
      // Reset elapsed summary timer for the next session.
      this.sink.resetElapsed();
    } catch {
      /* ignore */
    }
    try {
      // Drop renderer rows so the first new frame shows the next session only.
      this.sink.resetForRestart();
    } catch {
      /* ignore */
    }
  }
  /** Optional passthrough for an immediate render (used to avoid UI gaps). */
  flushNow(): void {
    try {
      this.sink.flushNow();
    } catch {
      /* ignore */
    }
  }
  installCancellation(triggerCancel: () => void, onRestart?: () => void): void {
    try {
      this.control = new RunnerControl({ onCancel: triggerCancel, onRestart });
      liveTrace.ui.installCancellation();
      this.control.attach();
    } catch {
      this.control = null;
    }
  }
  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    liveTrace.ui.stop();
    try {
      // Normal completion: persist final full table.
      this.sink.stop();
    } catch {
      /* ignore */
    }
    try {
      const ctl = this.control;
      if (ctl) {
        ctl.detach();
      }
    } catch {
      /* ignore */
    }
    this.control = null;
  }
}
