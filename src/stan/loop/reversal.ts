// src/stan/loop/reversal.ts
/**
 * Shared loop-reversal confirmation prompt.
 * - TTY-aware; non-TTY returns true.
 * - Honors STAN_YES=1 to auto-accept.
 * - Non-BORING mode dims the choices suffix (Y/n), matching init’s UX.
 */
import readline from 'node:readline';

import { dim, warn } from '@/stan/util/color';

/** Return true to proceed; false to abort. */
export const confirmLoopReversal = async (): Promise<boolean> => {
  // Non-interactive: proceed by default (CI-compatible; matches other prompts).
  const isTTY = Boolean(
    (process.stdout as unknown as { isTTY?: boolean })?.isTTY,
  );
  if (!isTTY) return true;

  // Global yes short-circuit
  if (process.env.STAN_YES === '1') return true;

  // Compose styled prompt:
  // - token: BORING handled inside color helpers
  // - choices: always call dim(); BORING/non‑TTY yields plain text
  const token = warn('⚠︎');
  const choices = dim('(Y/n)');
  const msg = `stan: ${token} loop reversal detected! Continue? ${choices} `;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const q = (s: string) =>
    new Promise<string>((res) => rl.question(s, (a) => res(a)));
  const a = (await q(msg)).trim();
  rl.close();

  // Default Yes: empty or starts with 'y'/'Y' proceeds
  return a === '' || /^[yY]/.test(a);
};
