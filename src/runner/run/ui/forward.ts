// src/stan/run/ui/forward.ts
/**
 * Small shared helper to DRY end-of-row handling between LiveUI and LoggerUI.
 * - Converts absolute output paths to repo-relative.
 * - Delegates to lifecycle endScript/endArchive with optional duration passthrough.
 *
 * Behavior:
 * - useDurations=true (LiveUI): preserves startedAt/endedAt/exitCode for rendering.
 * - useDurations=false (LoggerUI): suppresses durations/exitCode (logger parity).
 */
import type { ProgressModel } from '@/runner/run/progress/model';
import { endArchive, endScript } from '@/runner/run/ui/lifecycle';
import type { ArchiveKind } from '@/runner/run/ui/types';
import { relOut } from '@/runner/run/util/path';

export const createUiEndForwarders = (
  model: ProgressModel,
  opts?: { useDurations?: boolean },
) => {
  const withDur = Boolean(opts?.useDurations);
  return {
    onScriptEnd: (
      key: string,
      outAbs: string,
      cwd: string,
      startedAt?: number,
      endedAt?: number,
      exitCode?: number,
      status?: 'ok' | 'warn' | 'error',
    ): void => {
      const rel = relOut(cwd, outAbs);
      const s = withDur ? startedAt : undefined;
      const e = withDur ? endedAt : undefined;
      const code = withDur ? exitCode : undefined;
      endScript(model, key, rel, s, e, code, status);
    },
    onArchiveEnd: (
      kind: ArchiveKind,
      outAbs: string,
      cwd: string,
      startedAt?: number,
      endedAt?: number,
    ): void => {
      const rel = relOut(cwd, outAbs);
      const s = withDur ? startedAt : undefined;
      const e = withDur ? endedAt : undefined;
      endArchive(model, kind, rel, s, e);
    },
  };
};
