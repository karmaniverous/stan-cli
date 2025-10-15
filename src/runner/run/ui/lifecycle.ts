// src/runner/run/ui/lifecycle.ts
// Shared row lifecycle helpers for UI implementations (LiveUI, LoggerUI).
// Centralizes ProgressModel updates; rendering/logging remain in their sinks.

import type { ProgressModel } from '@/runner/run/progress/model';

import type { ArchiveKind } from './types';

// Scripts
export const queueScript = (model: ProgressModel, key: string): void => {
  model.update(
    `script:${key}`,
    { kind: 'waiting' },
    { type: 'script', item: key },
  );
};

export const startScript = (model: ProgressModel, key: string): void => {
  model.update(
    `script:${key}`,
    { kind: 'running', startedAt: Date.now() },
    { type: 'script', item: key },
  );
};

/**
 * End a script row with a final state. Duration is computed when started/ended
 * times are provided; otherwise duration is set to 0 (logger parity).
 */
export const endScript = (
  model: ProgressModel,
  key: string,
  outputRel: string,
  startedAt?: number,
  endedAt?: number,
  exitCode?: number,
  status?: 'ok' | 'warn' | 'error',
): void => {
  const dur =
    typeof startedAt === 'number' && typeof endedAt === 'number'
      ? Math.max(0, endedAt - startedAt)
      : 0;
  const isError =
    status === 'error' || (typeof exitCode === 'number' && exitCode !== 0);
  const st = isError
    ? ({ kind: 'error', durationMs: dur, outputPath: outputRel } as const)
    : status === 'warn'
      ? ({ kind: 'warn', durationMs: dur, outputPath: outputRel } as const)
      : ({ kind: 'done', durationMs: dur, outputPath: outputRel } as const);
  model.update(`script:${key}`, st, { type: 'script', item: key });
};

// Archives
export const queueArchive = (model: ProgressModel, kind: ArchiveKind): void => {
  const item = kind === 'diff' ? 'diff' : 'full';
  model.update(
    `archive:${item}`,
    { kind: 'waiting' },
    { type: 'archive', item },
  );
};

export const startArchive = (model: ProgressModel, kind: ArchiveKind): void => {
  const item = kind === 'diff' ? 'diff' : 'full';
  model.update(
    `archive:${item}`,
    { kind: 'running', startedAt: Date.now() },
    { type: 'archive', item },
  );
};

/**
 * End an archive row with a final state. Duration is computed when started/ended
 * times are provided; otherwise duration is set to 0 (logger parity).
 */
export const endArchive = (
  model: ProgressModel,
  kind: ArchiveKind,
  outputRel: string,
  startedAt?: number,
  endedAt?: number,
): void => {
  const item = kind === 'diff' ? 'diff' : 'full';
  const dur =
    typeof startedAt === 'number' && typeof endedAt === 'number'
      ? Math.max(0, endedAt - startedAt)
      : 0;
  model.update(
    `archive:${item}`,
    { kind: 'done', durationMs: dur, outputPath: outputRel },
    { type: 'archive', item },
  );
};
