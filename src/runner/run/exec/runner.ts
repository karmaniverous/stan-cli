/* src/stan/run/exec/runner.ts
 * Scheduling for concurrent/sequential execution; selection normalization.
 */
import {
  compileWarnPatterns,
  type RunHooks,
  runOne,
} from '@/runner/run/exec/run-one';
import { yieldToEventLoop } from '@/runner/run/exec/util';
import type { ProcessSupervisor } from '@/runner/run/live/supervisor';
import type {
  ExecutionMode,
  RunnerConfig,
  Selection,
} from '@/runner/run/types';

const configOrder = (config: RunnerConfig): string[] =>
  Object.keys(config.scripts ?? {});

/**
 * Normalize selection to config order.
 * - When selection is null/undefined, return all config keys.
 * - When selection exists:
 *   - [] =\> run nothing
 *   - non-empty =\> order by config order
 */
export const normalizeSelection = (
  selection: Selection | undefined | null,
  config: RunnerConfig,
): string[] => {
  const all = configOrder(config);
  if (!selection) return all;
  if (selection.length === 0) return [];
  const requested = new Set(selection);
  return all.filter((k) => requested.has(k));
};

/** CI-aware truthy detection (accepts common values: 1,true,TRUE). */
const ciOn = (): boolean => {
  try {
    const v = String(process.env.CI ?? '')
      .trim()
      .toLowerCase();
    return v !== '' && v !== '0' && v !== 'false';
  } catch {
    return false;
  }
};
/** Slightly longer pre-spawn guard for CI/POSIX to absorb late SIGINT. */
const preSpawnGuardMs = (): number => {
  const base = 25;
  let extra = 0;
  if (ciOn()) extra += 25;
  if (process.platform !== 'win32') extra += 10;
  return base + extra;
};

/**
 * Run a set of scripts concurrently or sequentially.
 * @param cwd - Working directory for child processes.
 * @param outAbs - Absolute output directory.
 * @param outRel - Relative output directory (for logs).
 * @param config - Runner configuration (stanPath + CLI-owned scripts).
 * @param toRun - Keys to run (must be present in config).
 * @param mode - Execution mode.
 * @param orderFile - Optional order file path (when present, records execution order).
 * @returns Absolute paths to generated output files.
 * @param hooks - Optional lifecycle hooks and flags.
 * @param opts - Optional execution options (e.g., silent logging).
 * @param shouldContinue - Optional gate to stop scheduling new scripts when false (sequential mode).
 * @param supervisor - Optional process supervisor for child tracking/termination.
 */
export const runScripts = async (
  cwd: string,
  outAbs: string,
  outRel: string,
  config: RunnerConfig,
  toRun: string[],
  mode: ExecutionMode,
  orderFile?: string,
  hooks?: RunHooks,
  opts?: { silent?: boolean },
  shouldContinue?: () => boolean,
  supervisor?: ProcessSupervisor,
): Promise<string[]> => {
  const created: string[] = [];

  const runner = async (k: string): Promise<void> => {
    // Pre-spawn cancellation gate (race closer)
    try {
      if (typeof shouldContinue === 'function' && !shouldContinue()) {
        return;
      }
    } catch {
      /* best-effort */
    }
    // Normalize script entry (string | { script, warnPattern? })
    const entry = config.scripts[k] as unknown;
    const cmd =
      typeof entry === 'string'
        ? entry
        : typeof entry === 'object' &&
            entry &&
            'script' in (entry as Record<string, unknown>)
          ? String((entry as { script: string }).script)
          : '';
    const warnPatterns =
      entry &&
      typeof entry === 'object' &&
      'warnPattern' in (entry as Record<string, unknown>)
        ? compileWarnPatterns(
            (entry as { warnPattern?: string }).warnPattern,
            (entry as { warnPatternFlags?: string }).warnPatternFlags,
          )
        : [];

    const p = await runOne(
      cwd,
      outAbs,
      outRel,
      k,
      cmd,
      orderFile,
      hooks,
      {
        silent:
          typeof hooks?.silent === 'boolean'
            ? hooks.silent
            : Boolean(opts?.silent),
        hangWarn: (opts as unknown as { hangWarn?: number })?.hangWarn,
        hangKill: (opts as unknown as { hangKill?: number })?.hangKill,
        hangKillGrace: (opts as unknown as { hangKillGrace?: number })
          ?.hangKillGrace,
        warnPatterns,
      },
      supervisor,
    );
    created.push(p);
  };

  if (mode === 'sequential') {
    for (const k of toRun) {
      // Allow pending SIGINT/keypress handlers before next spawn (race closer)
      const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      if (typeof shouldContinue === 'function') {
        if (!shouldContinue()) break;
        await yieldToEventLoop();
        if (!shouldContinue()) break;
        // Guard window to absorb late-arriving SIGINT (CI/POSIX slightly longer)
        await pause(preSpawnGuardMs());
        if (!shouldContinue()) break;
        // Extra yield after the guard to close the remaining sliver before spawn
        await yieldToEventLoop();
        if (!shouldContinue()) break;
      }
      await runner(k);
      if (typeof shouldContinue === 'function') {
        await yieldToEventLoop();
        if (!shouldContinue()) break;
      }
    }
  } else {
    const keys =
      typeof shouldContinue === 'function'
        ? toRun.filter(() => shouldContinue())
        : toRun;
    await Promise.all(keys.map((k) => runner(k).then(() => void 0)));
  }
  return created;
};
