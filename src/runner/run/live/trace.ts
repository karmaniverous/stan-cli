/* src/stan/run/live/trace.ts
 * Centralized, opt-in tracing for live run troubleshooting.
 * Emits to stderr only when STAN_LIVE_DEBUG=1, otherwise no-ops.
 * Keeps instrumentation out of core modules (renderer/UI/session).
 */

const enabled = (() => {
  try {
    return process.env.STAN_LIVE_DEBUG === '1';
  } catch {
    return false;
  }
})();

type Dict = Record<string, unknown>;
const emit = (area: string, label: string, payload?: Dict): void => {
  if (!enabled) return;
  try {
    if (payload && Object.keys(payload).length > 0) {
      console.error(`[stan:live:${area}] ${label}`, payload);
    } else {
      console.error(`[stan:live:${area}] ${label}`);
    }
  } catch {
    /* best-effort */
  }
};

export const liveTrace = {
  get enabled() {
    return enabled;
  },
  renderer: {
    start(payload?: Dict) {
      emit('renderer', 'start()', payload);
    },
    update(payload: Dict) {
      emit('renderer', 'update()', payload);
    },
    render(payload: Dict) {
      emit('renderer', 'render()', payload);
    },
    headerOnly(payload: Dict) {
      emit('renderer', 'render(header-only)', payload);
    },
    flush() {
      emit('renderer', 'flush()');
    },
    clear() {
      emit('renderer', 'clear()');
    },
    stop() {
      emit('renderer', 'stop()');
    },
    done() {
      emit('renderer', 'stop():done()');
    },
  },
  ui: {
    start() {
      emit('UI', 'start()');
    },
    installCancellation() {
      emit('UI', 'installCancellation(): control.attach()');
    },
    onCancelled(mode: 'cancel' | 'restart') {
      emit('UI', 'onCancelled()', { mode });
    },
    stop() {
      emit('UI', 'stop() -> sink.stop()');
    },
  },
  session: {
    info(message: string, payload?: Dict) {
      emit('session', message, payload);
    },
    exitHook() {
      emit(
        'session',
        'exit hook fired: ui.stop + supervisor cancel + pause stdin',
      );
    },
  },
} as const;

export type LiveTrace = typeof liveTrace;
