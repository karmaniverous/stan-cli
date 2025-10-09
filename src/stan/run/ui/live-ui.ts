// src/stan/run/ui/live-ui.ts
import { relative } from 'node:path';

import { RunnerControl } from '@/stan/run/control';
import { ProgressRenderer } from '@/stan/run/live/renderer';
import { liveTrace } from '@/stan/run/live/trace';
import { ProgressModel } from '@/stan/run/progress/model';
import { LiveSink } from '@/stan/run/progress/sinks/live';

import type { ArchiveKind, RunnerUI } from './types';

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
        try {
          this.control?.detach();
        } catch {
          /* ignore */
        }
        this.control = null;
        try {
          (
            this.renderer as unknown as { showHeaderOnly?: () => void }
          )?.showHeaderOnly?.();
        } catch {
          /* ignore */
        }
      } else {
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
