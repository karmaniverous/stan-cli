// src/stan/run/session/scripts-phase.ts
import { runScripts } from '@/stan/run/exec';
import type { ProcessSupervisor } from '@/stan/run/live/supervisor';
import type { RunnerConfig } from '@/stan/run/types';
import type { RunnerUI } from '@/stan/run/ui';

export const runScriptsPhase = async (args: {
  cwd: string;
  outAbs: string;
  outRel: string;
  config: RunnerConfig;
  toRun: string[];
  mode: 'concurrent' | 'sequential';
  orderFile?: string;
  ui: RunnerUI;
  epoch: symbol;
  isActive: (e: symbol) => boolean;
  shouldContinue: () => boolean;
  supervisor: ProcessSupervisor;
  liveEnabled: boolean;
  hangWarn?: number;
  hangKill?: number;
  hangKillGrace?: number;
}): Promise<string[]> => {
  const {
    cwd,
    outAbs,
    outRel,
    config,
    toRun,
    mode,
    orderFile,
    ui,
    epoch,
    isActive,
    shouldContinue,
    supervisor,
    liveEnabled,
    hangWarn,
    hangKill,
    hangKillGrace,
  } = args;

  const created: string[] = [];

  const collect = runScripts(
    cwd,
    outAbs,
    outRel,
    config,
    toRun,
    mode,
    orderFile,
    {
      onStart: (key) => {
        if (!isActive(epoch)) return;
        ui.onScriptStart(key);
      },
      onEnd: (key, outFileAbs, startedAt, endedAt, code, status) => {
        if (!isActive(epoch)) return;
        // Ignore late completions after cancellation for registered keys:
        // caller guards this via shouldContinue() + cancelledKeys checks.
        ui.onScriptEnd(key, outFileAbs, cwd, startedAt, endedAt, code, status);
        if (status === 'error' || (typeof code === 'number' && code !== 0)) {
          try {
            process.exitCode = 1;
          } catch {
            /* ignore */
          }
        }
      },
      silent: true,
      onHangWarn: (key, seconds) => {
        if (!isActive(epoch)) return;
        if (!liveEnabled) {
          try {
            console.log(
              `stan: ⏱ stalled "${key}" after ${seconds}s of inactivity`,
            );
          } catch {
            /* ignore */
          }
        }
      },
      onHangTimeout: (key, seconds) => {
        if (!isActive(epoch)) return;
        if (!liveEnabled) {
          try {
            console.log(
              `stan: ⏱ timeout "${key}" after ${seconds}s; sending SIGTERM`,
            );
          } catch {
            /* ignore */
          }
        }
      },
      onHangKilled: (key, grace) => {
        if (!isActive(epoch)) return;
        if (!liveEnabled) {
          try {
            console.log(`stan: ◼ killed "${key}" after ${grace}s grace`);
          } catch {
            /* ignore */
          }
        }
      },
    },
    {
      silent: true,
      hangWarn,
      hangKill,
      hangKillGrace,
    } as unknown as {
      silent?: boolean;
      hangWarn?: number;
      hangKill?: number;
      hangKillGrace?: number;
    },
    shouldContinue,
    supervisor,
  ).then((outs) => {
    created.push(...outs);
  });
  await collect.catch(() => void 0);
  return created;
};
