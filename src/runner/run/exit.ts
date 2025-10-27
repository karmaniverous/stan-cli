/* src/stan/run/exit.ts
 * Centralized exit hook using signal-exit.
 * Invokes the provided cleanup on process exit or fatal signals.
 */
import { onExit } from 'signal-exit';

export type UninstallExitHook = () => void;

/**
 * Install a best-effort cleanup hook for process exit and fatal signals.
 * The cleanup may be sync or async; async rejections are swallowed.
 *
 * @param cleanup - Function to invoke on exit/signals.
 * @returns Uninstall function to remove the hook.
 */
export function installExitHook(
  cleanup: () => void | Promise<void>,
): UninstallExitHook {
  // signal-exit returns an uninstaller function.
  return onExit(() => {
    try {
      const res = cleanup();
      if (res && typeof (res as Promise<unknown>).then === 'function') {
        (res as Promise<unknown>).catch(() => void 0);
      }
    } catch {
      // ignore
    }
  });
}
