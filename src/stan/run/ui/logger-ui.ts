// src/stan/run/ui/logger-ui.ts
import { relative } from 'node:path';

import { ProgressModel } from '@/stan/run/progress/model';
import { LoggerSink } from '@/stan/run/progress/sinks/logger';

import type { ArchiveKind, RunnerUI } from './types';

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
    // logger mode renders per-event lines only
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
  onCancelled(): void {}
  installCancellation(): void {}
  stop(): void {
    this.sink.stop();
  }
}
