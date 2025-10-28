/* src/stan/util/color.ts
 * Meaning-based color helpers that respect STAN_BORING/NO_COLOR/FORCE_COLOR.
 * BORING or non‑TTY => return unstyled strings.
 */
import chalk from 'chalk';

export const isBoring = (): boolean => {
  // Compute TTY dynamically so tests and callers can toggle isTTY/env reliably.
  const tty = Boolean((process.stdout as unknown as { isTTY?: boolean }).isTTY);
  return (
    process.env.STAN_BORING === '1' ||
    process.env.NO_COLOR === '1' ||
    process.env.FORCE_COLOR === '0' ||
    !tty
  );
};

/** Semantic aliases (unstyled in BORING/non‑TTY) */
export const ok = (s: string): string => (isBoring() ? s : chalk.green(s));
export const alert = (s: string): string => (isBoring() ? s : chalk.cyan(s));
export const go = (s: string): string => (isBoring() ? s : chalk.blue(s));
export const error = (s: string): string => (isBoring() ? s : chalk.red(s));
export const stop = (s: string): string => (isBoring() ? s : chalk.black(s));
export const cancel = (s: string): string => (isBoring() ? s : chalk.gray(s));
export const warn = (s: string): string =>
  isBoring() ? s : chalk.hex('#FFA500')(s); // orange

/** Text styles (unstyled in BORING/non‑TTY) */
export const bold = (s: string): string => (isBoring() ? s : chalk.bold(s));
export const dim = (s: string): string => (isBoring() ? s : chalk.dim(s));
export const underline = (s: string): string =>
  isBoring() ? s : chalk.underline(s);
