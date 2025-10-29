/** src/cli/patch/apply-local.ts
 * Local unified‑diff apply path (shim → jsdiff fallback).
 * - Tries "./apply".runGitApply (mockable in tests).
 * - Falls back to engine applyWithJsDiff (preserves EOLs).
 */
import path from 'node:path';

import { applyWithJsDiff } from '@karmaniverous/stan-core';

import { parseFirstTarget } from './detect';

export const applyUnifiedDiffLocally = async (
  cwd: string,
  cleaned: string,
  check: boolean,
): Promise<{ ok: boolean; firstTarget?: string }> => {
  const firstTarget = parseFirstTarget(cleaned);
  // Try git‑apply via local shim (mockable)
  try {
    const mod = (await import('../apply')) as unknown as {
      runGitApply?: (args: {
        cwd: string;
        patchAbs: string;
        cleaned: string;
        stripOrder?: number[];
      }) => Promise<{ ok: boolean }>;
      default?:
        | {
            runGitApply?: (args: {
              cwd: string;
              patchAbs: string;
              cleaned: string;
              stripOrder?: number[];
            }) => Promise<{ ok: boolean }>;
          }
        | ((...a: unknown[]) => unknown);
    };
    const runGitApply =
      (mod as { runGitApply?: unknown }).runGitApply ??
      (mod as { default?: { runGitApply?: unknown } }).default?.runGitApply;
    if (typeof runGitApply === 'function') {
      const gitOut = await runGitApply({
        cwd,
        patchAbs: path.join(cwd, '.stan', 'patch', '.patch'),
        cleaned,
        stripOrder: [1, 0],
      });
      if (gitOut && gitOut.ok) {
        return { ok: true, firstTarget };
      }
    }
  } catch {
    /* ignore and fall through */
  }
  // jsdiff fallback
  try {
    const js = await applyWithJsDiff({ cwd, cleaned, check });
    const ok = Array.isArray(js.failed) ? js.failed.length === 0 : false;
    return { ok, firstTarget };
  } catch {
    return { ok: false, firstTarget };
  }
};
