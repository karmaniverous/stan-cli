// src/stan/run/ui.ts
/**
 * Runner UI ports and adapters:
 * - LoggerUI: legacy console logs (no-live).
 * - LiveUI: ProgressRenderer + TTY key handling (live).
 */
import { relative } from 'node:path';

import { liveTrace } from '@/stan/run/live/trace';

import { RunnerControl } from './control';
import { ProgressRenderer } from './live/renderer';
import { ProgressModel } from './progress/model';
import { LiveSink } from './progress/sinks/live';
import { LoggerSink } from './progress/sinks/logger';

export type ArchiveKind = 'full' | 'diff';

export type RunnerUI = {
  start(): void;
  onPlan(planBody: string): void;
  onScriptQueued(key: string): void;
  onScriptStart(key: string): void;
  onScriptEnd(
    key: string,
    outAbs: string,
    cwd: string,
    startedAt: number,
    endedAt: number,
    exitCode?: number,
    status?: 'ok' | 'warn' | 'error',
  ): void;
  onArchiveQueued(kind: ArchiveKind): void;
  onArchiveStart(kind: ArchiveKind): void;
  onArchiveEnd(
    kind: ArchiveKind,
    outAbs: string,
    cwd: string,
    startedAt: number,
    endedAt: number,
  ): void;
  onCancelled(mode?: 'cancel' | 'restart'): void;
  installCancellation(triggerCancel: () => void, onRestart?: () => void): void;
  stop(): void;
};

export class LoggerUI implements RunnerUI {
  private readonly model = new ProgressModel();
  private readonly sink: LoggerSink;
  constructor() {
    this.sink = new LoggerSink(this.model, process.cwd());
  }
  start(): void {
    this.sink.start();
  }
  onPlan(planBody: string): void {
    console.log(planBody);
  }
  onScriptQueued(key: string): void {
    this.model.update(
      `script:${key}`,
      { kind: 'waiting' },
      { type: 'script', item: key },
    );
  }
  onScriptStart(key: string): void {
    this.model.update(
      `script:${key}`,
      { kind: 'running', startedAt: Date.now() },
      { type: 'script', item: key },
    );
  }
  onScriptEnd(
    key: string,
    outAbs: string,
    cwd: string,
    _startedAt: number,
    _endedAt: number,
    _exitCode?: number,
    status?: 'ok' | 'warn' | 'error',
  ): void {
    const rel = relative(cwd, outAbs).replace(/\\/g, '/');
    const st =
      status === 'error'
        ? ({ kind: 'error', durationMs: 0, outputPath: rel } as const)
        : status === 'warn'
          ? ({ kind: 'warn', durationMs: 0, outputPath: rel } as const)
          : ({ kind: 'done', durationMs: 0, outputPath: rel } as const);
    this.model.update(`script:${key}`, st, { type: 'script', item: key });
  }
  onArchiveQueued(): void {
    // Emit a waiting row for visual parity with live.
    // Label resolution occurs in the sink.
    return;
  }
  onArchiveStart(kind: ArchiveKind): void {
    const item = kind === 'full' ? 'full' : 'diff';
    this.model.update(
      `archive:${item}`,
      { kind: 'running', startedAt: Date.now() },
      { type: 'archive', item },
    );
  }
  onArchiveEnd(kind: ArchiveKind, outAbs: string, cwd: string): void {
    const rel = relative(cwd, outAbs).replace(/\\/g, '/');
    const item = kind === 'full' ? 'full' : 'diff';
    this.model.update(
      `archive:${item}`,
      { kind: 'done', durationMs: 0, outputPath: rel },
      { type: 'archive', item },
    );
  }
  onCancelled(mode?: 'cancel' | 'restart'): void {
    void mode;
    // no-op (session handles SIGINT; no TTY keys in logger mode)
  }
  installCancellation(triggerCancel: () => void): void {
    // no-op: non-live mode relies on session-level SIGINT handling.
    void triggerCancel;
  }
  stop(): void {
    this.sink.stop();
  }
}

export class LiveUI implements RunnerUI {
  private renderer: ProgressRenderer | null = null;
  private control: RunnerControl | null = null;
  private readonly model = new ProgressModel();
  private readonly sink: LiveSink;

  constructor(private readonly opts?: { boring?: boolean }) {
    this.sink = new LiveSink(this.model, { boring: Boolean(opts?.boring) });
  }

  start(): void {
    liveTrace.ui.start();
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
    this.model.update(
      `script:${key}`,
      { kind: 'waiting' },
      { type: 'script', item: key },
    );
  }
  onScriptStart(key: string): void {
    this.model.update(
      `script:${key}`,
      { kind: 'running', startedAt: Date.now() },
      { type: 'script', item: key },
    );
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
    const rel = relative(cwd, outAbs).replace(/\\/g, '/');
    const st =
      status === 'error' || (typeof exitCode === 'number' && exitCode !== 0)
        ? {
            kind: 'error' as const,
            durationMs: Math.max(0, endedAt - startedAt),
            outputPath: rel,
          }
        : status === 'warn'
          ? {
              kind: 'warn' as const,
              durationMs: Math.max(0, endedAt - startedAt),
              outputPath: rel,
            }
          : {
              kind: 'done' as const,
              durationMs: Math.max(0, endedAt - startedAt),
              outputPath: rel,
            };
    this.model.update(`script:${key}`, st, { type: 'script', item: key });
  }
  onArchiveQueued(kind: ArchiveKind): void {
    const item = kind === 'full' ? 'full' : 'diff';
    this.model.update(
      `archive:${item}`,
      { kind: 'waiting' },
      { type: 'archive', item },
    );
  }
  onArchiveStart(kind: ArchiveKind): void {
    const item = kind === 'full' ? 'full' : 'diff';
    this.model.update(
      `archive:${item}`,
      { kind: 'running', startedAt: Date.now() },
      { type: 'archive', item },
    );
  }
  onArchiveEnd(
    kind: ArchiveKind,
    outAbs: string,
    cwd: string,
    startedAt: number,
    endedAt: number,
  ): void {
    const item = kind === 'full' ? 'full' : 'diff';
    const rel = relative(cwd, outAbs).replace(/\\/g, '/');
    this.model.update(
      `archive:${item}`,
      {
        kind: 'done',
        durationMs: Math.max(0, endedAt - startedAt),
        outputPath: rel,
      },
      { type: 'archive', item },
    );
  }
  /**
   * Tear down live rendering on cancellation.
   * - mode === 'cancel' (default): persist the final frame (do not clear).
   * - mode === 'restart': roll back to header and persist, so the next run reuses
   *   the same UI area without a flash.
   */
  onCancelled(mode: 'cancel' | 'restart' = 'cancel'): void {
    liveTrace.ui.onCancelled(mode);
    try {
      (
        this.sink as unknown as { cancelPending?: () => void }
      )?.cancelPending?.();
    } catch {
      /* ignore */
    }
    try {
      if (mode === 'restart') {
        liveTrace.session.info(
          'restart: detach keys + render header-only bridge',
        );
        // Restart: keep the same renderer/sink alive and reuse the drawing area.
        // Detach key handlers so next session can re-attach cleanly.
        try {
          this.control?.detach();
        } catch {
          /* ignore */
        }
        this.control = null;
        // Render a single header-only frame to bridge the restart boundary,
        // without clearing/stopping. The next session will reuse the same area.
        try {
          (
            this.renderer as unknown as { showHeaderOnly?: () => void }
          )?.showHeaderOnly?.();
        } catch {
          /* ignore */
        }
      } else {
        // cancel: persist final frame (log-update done via stop)
        liveTrace.ui.stop();
        this.sink.stop();
      }
    } catch {
      /* ignore */
    }
    try {
      this.control?.detach();
    } catch {
      /* ignore */
    }
    this.control = null;
  }
  installCancellation(triggerCancel: () => void, onRestart?: () => void): void {
    try {
      this.control = new RunnerControl({ onCancel: triggerCancel, onRestart });
      liveTrace.ui.installCancellation();
      this.control.attach();
    } catch {
      // best-effort
      this.control = null;
    }
  }
  stop(): void {
    liveTrace.ui.stop();
    try {
      this.sink.stop();
    } catch {
      /* ignore */
    }
    try {
      this.control?.detach();
    } catch {
      /* ignore */
    }
    this.control = null;
  }
}
