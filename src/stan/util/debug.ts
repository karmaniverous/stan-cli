/* src/stan/util/debug.ts
 * Centralized, opt-in debug logger for fallback paths.
 * Emits only when STAN_DEBUG=1 to avoid noisy output in normal mode.
 */

const on = (): boolean => {
  try {
    return process.env.STAN_DEBUG === '1';
  } catch {
    return false;
  }
};

/** Log a concise fallback notice under STAN_DEBUG=1 (scope: module:function; reason/message). */
export const debugFallback = (scope: string, reason: string): void => {
  if (!on()) return;
  try {
    // stderr to keep separation from normal logs
    console.error(`stan: debug: fallback: ${scope}: ${reason}`);
  } catch {
    /* ignore */
  }
};
