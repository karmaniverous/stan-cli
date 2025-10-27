/* src/stan/run/exec/util.ts
 * Utilities for scheduling and stream handling.
 */

/** Yield one event-loop tick so pending signal/key handlers can run. */
export const yieldToEventLoop = (): Promise<void> =>
  new Promise<void>((resolveP) => setImmediate(resolveP));

/** Await a writable stream's 'close' or 'error'. */
export const waitForStreamClose = (
  stream: NodeJS.WritableStream,
): Promise<void> =>
  new Promise<void>((resolveP, rejectP) => {
    stream.on('close', () => {
      resolveP();
    });
    stream.on('error', (e) => {
      rejectP(e instanceof Error ? e : new Error(String(e)));
    });
  });
