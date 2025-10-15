/* src/stan/run/live/supervisor.ts
 * ProcessSupervisor: graceful cancellation with TERM → grace → KILL.
 */
import treeKill from 'tree-kill';

import type { RunBehavior } from '../types';

export class ProcessSupervisor {
  constructor(
    private readonly behavior: Pick<
      RunBehavior,
      'hangWarn' | 'hangKill' | 'hangKillGrace'
    >,
  ) {}

  private readonly pids = new Map<string, number>();
  /** Snapshot of the most recently cancelled PIDs for bounded join. */
  private lastCancelled: number[] = [];

  track(key: string, pid: number): void {
    this.pids.set(key, pid);
  }

  /**
   * Terminate all tracked processes.
   * - Default: TERM, then KILL after hangKillGrace seconds.
   * - immediate=true: TERM, then KILL without delay (user cancellation).
   */
  cancelAll(opts?: { immediate?: boolean }): void {
    const graceSec =
      typeof this.behavior.hangKillGrace === 'number'
        ? this.behavior.hangKillGrace
        : 10;
    const graceMs = opts?.immediate ? 0 : Math.max(0, graceSec * 1000);
    const current = Array.from(this.pids.entries());
    const currentPids = Array.from(this.pids.values());
    this.lastCancelled = currentPids;
    for (const [, pid] of current) {
      try {
        if (Number.isFinite(pid)) process.kill(pid, 'SIGTERM');
      } catch {
        // ignore
      }
    }
    const hardKill = () => {
      for (const [, pid] of current) {
        try {
          if (Number.isFinite(pid)) treeKill(pid, 'SIGKILL');
        } catch {
          // ignore
        }
      }
    };
    if (graceMs <= 0) {
      setTimeout(hardKill, 0);
    } else {
      setTimeout(hardKill, graceMs);
    }
    this.pids.clear();
  }

  /**
   * Best-effort bounded join on the most recently cancelled PIDs.
   * Polls liveness with signal 0; returns when all are gone or timeout elapses.
   */
  public async waitAll(timeoutMs = 2000): Promise<void> {
    const ids =
      this.lastCancelled.length > 0
        ? [...this.lastCancelled]
        : Array.from(this.pids.values());
    if (ids.length === 0) return;
    const deadline = Date.now() + Math.max(0, timeoutMs);
    const isAlive = (pid: number): boolean => {
      try {
        // signal 0: check existence; throws if ESRCH
        // returns true when process exists and the signal can be sent
        return process.kill(pid, 0);
      } catch {
        return false;
      }
    };
    while (Date.now() < deadline) {
      const remaining = ids.filter((pid) => isAlive(pid));
      if (remaining.length === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    this.lastCancelled = [];
  }
}
