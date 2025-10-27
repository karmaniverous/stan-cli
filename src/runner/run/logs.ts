/* src/stan/run/logs.ts
 * Shared, BORING-friendly log helpers for non‑TTY script hang events.
 */
export const logStalledNoLive = (key: string, seconds: number): void => {
  try {
    console.log(
      `stan: ⏱ stalled "${key}" after ${String(seconds)}s of inactivity`,
    );
  } catch {
    /* ignore */
  }
};

export const logTimeoutNoLive = (key: string, seconds: number): void => {
  try {
    console.log(
      `stan: ⏱ timeout "${key}" after ${String(seconds)}s; sending SIGTERM`,
    );
  } catch {
    /* ignore */
  }
};

export const logKilledNoLive = (key: string, graceSeconds: number): void => {
  try {
    console.log(
      `stan: ◼ killed "${key}" after ${String(graceSeconds)}s grace`,
    );
  } catch {
    /* ignore */
  }
};
