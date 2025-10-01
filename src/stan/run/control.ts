/* src/stan/run/control.ts
 * RunnerControl — centralizes live cancellation wiring.
 * - Builtins only: readline.emitKeypressEvents + setRawMode for TTY.
 * - Keys: 'q' → cancel, 'r' → restart (when onRestart provided).
 * - Includes a minimal 'data' fallback (also handles ^C 0x03) for tests.
 * - Idempotent attach/detach; always restores raw mode and pauses stdin.
 */
import { emitKeypressEvents } from 'node:readline';

export type RunnerControlOptions = {
  onCancel: () => void;
  onRestart?: () => void;
};

export class RunnerControl {
  private readonly onCancel: () => void;
  private readonly onRestart?: () => void;

  private attached = false;
  private keyHandler?: (
    chunk: unknown,
    key?: { name?: string; ctrl?: boolean },
  ) => void;
  private dataHandler?: (d: unknown) => void;

  constructor(opts: RunnerControlOptions) {
    this.onCancel = opts.onCancel;
    this.onRestart = opts.onRestart;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    const stdin = process.stdin as unknown as NodeJS.ReadStream & {
      isTTY?: boolean;
      setRawMode?: (v: boolean) => void;
      resume?: () => void;
      pause?: () => void;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      off?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: unknown[]) => void,
      ) => void;
    };
    const stdoutTTY = Boolean(
      (process.stdout as unknown as { isTTY?: boolean }).isTTY,
    );
    const stdinTTY = Boolean((stdin as { isTTY?: boolean }).isTTY);
    const isTTY = stdoutTTY && stdinTTY;
    if (!isTTY) return; // non‑TTY: SIGINT is sufficient

    // Enable keypress events and raw mode.
    try {
      emitKeypressEvents(stdin);
      stdin.setRawMode?.(true);
      stdin.resume?.();
    } catch {
      // best‑effort
    }

    this.keyHandler = (_chunk, keyMaybe) => {
      const key = keyMaybe ?? ({} as { name?: string; ctrl?: boolean });
      const name = (key.name ?? '').toLowerCase();
      // Only handle 'q' (cancel) and 'r' (restart) here. SIGINT is handled by session.
      if (name === 'q') {
        this.onCancel();
        return;
      }
      if (name === 'r') this.onRestart?.();
    };

    // Minimal data fallback (compat with tests that emit 'data', 'q').
    this.dataHandler = (d: unknown) => {
      try {
        if (typeof d === 'string') {
          const s = d.toLowerCase();
          // ^C (0x03) still cancels in raw mode via 'data' fallback
          if (s === '\u0003' || s === 'q') this.onCancel();
          else if (s === 'r') this.onRestart?.();
          return;
        }
        if (Buffer.isBuffer(d)) {
          if (d.includes(0x03)) {
            this.onCancel();
            return;
          }
          const s = d.toString('utf8').toLowerCase();
          if (s === 'q') this.onCancel();
          else if (s === 'r') this.onRestart?.();
        }
      } catch {
        // best‑effort
      }
    };

    // Attach listeners
    stdin.on?.('keypress', this.keyHandler as (...args: unknown[]) => void);
    stdin.on?.('data', this.dataHandler as (...args: unknown[]) => void);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;

    const stdin = process.stdin as unknown as NodeJS.ReadStream & {
      setRawMode?: (v: boolean) => void;
      pause?: () => void;
      off?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: unknown[]) => void,
      ) => void;
    };
    const remove =
      (stdin.off?.bind(stdin) as
        | ((e: string, h: (...args: unknown[]) => void) => void)
        | undefined) ??
      (stdin.removeListener?.bind(stdin) as
        | ((e: string, h: (...args: unknown[]) => void) => void)
        | undefined);

    try {
      if (remove && this.keyHandler) {
        remove(
          'keypress',
          this.keyHandler as unknown as (...args: unknown[]) => void,
        );
      }
      if (remove && this.dataHandler) {
        remove(
          'data',
          this.dataHandler as unknown as (...args: unknown[]) => void,
        );
      }
    } catch {
      /* ignore */
    }

    try {
      stdin.setRawMode?.(false);
      stdin.pause?.();
    } catch {
      /* ignore */
    }
  }
}
