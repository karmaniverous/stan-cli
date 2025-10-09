// src/stan/run/live/types.ts
export type ScriptState =
  | { kind: 'waiting' }
  | { kind: 'running'; startedAt: number; lastOutputAt?: number }
  | { kind: 'warn'; durationMs: number; outputPath?: string }
  | {
      kind: 'quiet';
      startedAt: number;
      lastOutputAt?: number;
      quietFor: number;
    }
  | {
      kind: 'stalled';
      startedAt: number;
      lastOutputAt: number;
      stalledFor: number;
    }
  | { kind: 'done'; durationMs: number; outputPath?: string }
  | { kind: 'error'; durationMs: number; outputPath?: string }
  | { kind: 'timedout'; durationMs: number; outputPath?: string }
  | { kind: 'cancelled'; durationMs?: number }
  | { kind: 'killed'; durationMs?: number };

export type RowMeta = { type: 'script' | 'archive'; item: string };
