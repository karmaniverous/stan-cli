/* src/stan/util/color.ts
 * Meaning-based color helpers that respect STAN_BORING/NO_COLOR/FORCE_COLOR.
 * BORING or non‑TTY => return unstyled strings.
 */
import chalk from 'chalk';

export function isBoring(): boolean {
  // Compute TTY dynamically so tests and callers can toggle isTTY/env reliably.
  const tty = Boolean((process.stdout as unknown as { isTTY?: boolean }).isTTY);
  return (
    process.env.STAN_BORING === '1' ||
    process.env.NO_COLOR === '1' ||
    process.env.FORCE_COLOR === '0' ||
    !tty
  );
}

/** Semantic aliases (unstyled in BORING/non‑TTY) */
export function ok(s: string): string {
  return isBoring() ? s : chalk.green(s);
}
export function alert(s: string): string {
  return isBoring() ? s : chalk.cyan(s);
}
export function go(s: string): string {
  return isBoring() ? s : chalk.blue(s);
}
export function error(s: string): string {
  return isBoring() ? s : chalk.red(s);
}
export function stop(s: string): string {
  return isBoring() ? s : chalk.black(s);
}
export function cancel(s: string): string {
  return isBoring() ? s : chalk.gray(s);
}
export function warn(s: string): string {
  return isBoring() ? s : chalk.hex('#FFA500')(s);
} // orange

/** Text styles (unstyled in BORING/non‑TTY) */
export function bold(s: string): string {
  return isBoring() ? s : chalk.bold(s);
}
export function dim(s: string): string {
  return isBoring() ? s : chalk.dim(s);
}
export function underline(s: string): string {
  return isBoring() ? s : chalk.underline(s);
}
