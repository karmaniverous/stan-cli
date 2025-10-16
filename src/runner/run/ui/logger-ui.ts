// src/stan/run/ui/logger-ui.ts

import { LoggerSink, ProgressModel } from '@/runner/run/progress';
import { relOut } from '@/runner/run/util/path';

import {
  endArchive,
  endScript,
  queueScript,
  startArchive,
  startScript,
} from './lifecycle';
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
    queueScript(this.model, key);
  }
  onScriptStart(key: string): void {
    startScript(this.model, key);
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
    const rel = relOut(cwd, outAbs);
    // Logger parity: no duration; exitCode considered via status mapping.
    endScript(this.model, key, rel, undefined, undefined, undefined, status);
  }
  onArchiveQueued(): void {
    // logger mode renders per-event lines only
  }
  onArchiveStart(kind: ArchiveKind): void {
    startArchive(this.model, kind);
  }
  onArchiveEnd(kind: ArchiveKind, outAbs: string, cwd: string): void {
    const rel = relOut(cwd, outAbs);
    endArchive(this.model, kind, rel);
  }
  onCancelled(): void {}
  installCancellation(): void {}
  stop(): void {
    this.sink.stop();
  }
}
