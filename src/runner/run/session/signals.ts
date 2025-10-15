// src/stan/run/session/signals.ts
import { installExitHook } from '@/runner/run/exit';
import { liveTrace } from '@/runner/run/live/trace';

export const attachSessionSignals = (
  onSigint: () => void,
  onExitCleanup: () => void | Promise<void>,
): (() => void) => {
  try {
    liveTrace.session.info('install SIGINT handler');
    process.on('SIGINT', onSigint);
  } catch {
    /* ignore */
  }
  const uninstall = installExitHook(onExitCleanup);
  return () => {
    try {
      liveTrace.session.info('detach SIGINT handler');
      process.off('SIGINT', onSigint);
    } catch {
      /* ignore */
    }
    try {
      liveTrace.session.info('uninstall exit hook');
      uninstall();
    } catch {
      /* ignore */
    }
  };
};
