// src/stan/loop/reversal.ts
/**
 * Shared loop-reversal confirmation prompt.
 * - TTY-aware; non-TTY returns true (proceed).
 * - Honors STAN_YES=1 to auto-accept (proceed).
 * - Non-BORING mode dims the choices suffix (Y/n); BORING shows plain text.
 */
import readline from 'node:readline';

import { dim, isBoring, warn } from '@/runner/util/color';

/** Return true to proceed; false to abort. */
export const confirmLoopReversal = async (): Promise<boolean> => {
  // Non-interactive: proceed by default (CI-compatible; matches other prompts).
  const isTTY = Boolean(
    (process.stdout as unknown as { isTTY?: boolean }).isTTY,
  );
  if (!isTTY) return true;

  // Global yes short-circuit
  if (process.env.STAN_YES === '1') return true;

  // BORING detection mirrors util/color: BORING or non‑TTY => unstyled strings.
  const boring = isBoring();

  // Compose styled prompt:
  // - token: in BORING show [WARN]; otherwise use the warning glyph
  // - choices: always call dim(); BORING/non‑TTY yields plain text
  const token = boring ? '[WARN]' : warn('⚠︎');
  const choices = dim('(Y/n)');
  // New wording: ask to Abort? (default Yes).
  // Return false on empty/'y' (abort); true on explicit 'n' (proceed).
  const msg = `stan: ${token} Loop reversal detected! Abort? ${choices} `;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const q = (s: string) =>
    new Promise<string>((res) => {
      rl.question(s, (a) => {
        res(a);
      });
    });
  const a = (await q(msg)).trim();
  rl.close();

  // Default Yes (Abort): empty or starts with 'y'/'Y' => abort (return false).
  // Explicit No: starts with 'n'/'N' => proceed (return true).
  if (a === '' || /^[yY]/.test(a)) return false;
  if (/^[nN]/.test(a)) return true;
  // Any other answer: treat as default (abort).
  return false;
};
