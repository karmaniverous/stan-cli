// src/stan/run/ui/logger-ui.ts

import { ProgressModel } from '@/runner/run/progress';
import { createUiEndForwarders } from '@/runner/run/ui/forward';

import { queueScript, startArchive, startScript } from './lifecycle';
import type { ArchiveKind, RunnerUI } from './types';

/** SSR/mock‑robust instantiation for LoggerSink. Accepts class constructor or function shapes. */
const createLoggerSink = (
  model: ProgressModel,
): { start: () => void; stop: () => void } => {
  // Access shapes: named export, default.LoggerSink, or default as function.
  const mod = (await Promise.resolve().then(
    () => import('@/runner/run/progress'),
  )) as unknown as {
    LoggerSink?: unknown;
    default?: { LoggerSink?: unknown } | ((...a: unknown[]) => unknown);
  };
  const pick =
    (mod as { LoggerSink?: unknown }).LoggerSink ??
    (mod.default &&
    typeof mod.default === 'object' &&
    (mod.default as { LoggerSink?: unknown }).LoggerSink
      ? (mod.default as { LoggerSink?: unknown }).LoggerSink
      : undefined);
  const cwd = process.cwd();
  // Try constructor form first, then callable form.
  if (typeof pick === 'function') {
    try {
      return new (pick as unknown as new (...a: unknown[]) => {
        start: () => void;
        stop: () => void;
      })(model, cwd);
    } catch {
      return (
        pick as unknown as (
          m: ProgressModel,
          c: string,
        ) => {
          start: () => void;
          stop: () => void;
        }
      )(model, cwd);
    }
  }
  if (typeof mod.default === 'function') {
    return (
      mod.default as unknown as (
        m: ProgressModel,
        c: string,
      ) => {
        start: () => void;
        stop: () => void;
      }
    )(model, cwd);
  }
  throw new Error('LoggerSink not available');
};

export class LoggerUI implements RunnerUI {
  private readonly model = new ProgressModel();
  private readonly sink: { start: () => void; stop: () => void };
  private forwards: ReturnType<typeof createUiEndForwarders> | null = null;
  constructor() {
    this.sink = createLoggerSink(this.model);
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
