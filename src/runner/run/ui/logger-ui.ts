// src/stan/run/ui/logger-ui.ts

import {
  LoggerSink as LoggerSinkAny,
  ProgressModel,
} from '@/runner/run/progress';
import { createUiEndForwarders } from '@/runner/run/ui/forward';

import { queueScript, startArchive, startScript } from './lifecycle';
import type { ArchiveKind, RunnerUI } from './types';

export class LoggerUI implements RunnerUI {
  private readonly model = new ProgressModel();
  private readonly sink: { start: () => void; stop: () => void };
  private forwards: ReturnType<typeof createUiEndForwarders> | null = null;
  constructor() {
    // SSR/mock‑robust: LoggerSink may be a constructor or a factory function in tests/mocks.
    const cwd = process.cwd();
    let sink: { start: () => void; stop: () => void } | null = null;
    const anySink = LoggerSinkAny as unknown;
    if (typeof anySink === 'function') {
      // Try class constructor first
      try {
        sink = new (anySink as unknown as new (
          m: ProgressModel,
          c: string,
        ) => { start: () => void; stop: () => void })(this.model, cwd);
      } catch {
        // Fall back to callable factory
        try {
          sink = (
            anySink as unknown as (
              m: ProgressModel,
              c: string,
            ) => { start: () => void; stop: () => void }
          )(this.model, cwd);
        } catch {
          sink = null;
        }
      }
    }
    if (!sink) {
      throw new Error('LoggerSink not available');
    }
    this.sink = sink;
    this.forwards = createUiEndForwarders(this.model, { useDurations: false });
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
    // Logger parity preserved by useDurations=false in the forwarder.
    this.forwards?.onScriptEnd(
      key,
      outAbs,
      cwd,
      undefined,
      undefined,
      undefined,
      status,
    );
  }
  onArchiveQueued(): void {
    // logger mode renders per-event lines only
  }
  onArchiveStart(kind: ArchiveKind): void {
    startArchive(this.model, kind);
  }
  onArchiveEnd(kind: ArchiveKind, outAbs: string, cwd: string): void {
    this.forwards?.onArchiveEnd(kind, outAbs, cwd, undefined, undefined);
  }
  onCancelled(): void {}
  installCancellation(): void {}
  stop(): void {
    this.sink.stop();
  }
}
