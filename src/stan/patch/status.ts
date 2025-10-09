// src/stan/patch/status.ts
import { error as colorError, ok as colorOk } from '@/stan/util/color';

/** BORING detection aligned with util/color (TTY + environment). */
const isBoring = (): boolean => {
  const isTTY = Boolean(
    (process.stdout as unknown as { isTTY?: boolean })?.isTTY,
  );
  return (
    process.env.STAN_BORING === '1' ||
    process.env.NO_COLOR === '1' ||
    process.env.FORCE_COLOR === '0' ||
    !isTTY
  );
};

/** Status tokens: colorized in TTY; bracketed in BORING/non‑TTY. */
export const statusOk = (s: string): string =>
  isBoring() ? `[OK] ${s}` : `${colorOk('✔')} ${s}`;
export const statusFail = (s: string): string =>
  isBoring() ? `[FAIL] ${s}` : `${colorError('✖')} ${s}`;
