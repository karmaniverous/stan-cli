// src/stan/patch/status.ts
import {
  error as colorError,
  isBoring,
  ok as colorOk,
} from '@/runner/util/color';

/** BORING detection aligned with util/color (TTY + environment). */

/** Status tokens: colorized in TTY; bracketed in BORING/non‑TTY. */
export const statusOk = (s: string): string =>
  isBoring() ? `[OK] ${s}` : `${colorOk('✔')} ${s}`;
export const statusFail = (s: string): string =>
  isBoring() ? `[FAIL] ${s}` : `${colorError('✖')} ${s}`;
