/** src/cli/patch/apply-local.ts
 * Local unified‑diff apply path (shim → jsdiff fallback).
 * - Tries "./apply".runGitApply (mockable in tests).
 * - Falls back to engine applyWithJsDiff (preserves EOLs).
 */
import path from 'node:path';

import { applyWithJsDiff } from '@karmaniverous/stan-core';

import { parseFirstTarget } from './detect';

type RunGitApplyFn = (args: {
  cwd: string;
  patchAbs: string;
  cleaned: string;
  stripOrder?: number[];
}) => Promise<{ ok: boolean }>;

const pickRunGitApply = (modUnknown: unknown): RunGitApplyFn | null => {
  const mod = modUnknown as {
    runGitApply?: unknown;
    default?: { runGitApply?: unknown };
  };
  const cand = (
    typeof mod.runGitApply === 'function'
      ? mod.runGitApply
      : typeof mod.default?.runGitApply === 'function'
        ? mod.default.runGitApply
        : undefined
  ) as RunGitApplyFn | undefined;
  return typeof cand === 'function' ? cand : null;
};

export const applyUnifiedDiffLocally = async (
  cwd: string,
  cleaned: string,
  check: boolean,
): Promise<{ ok: boolean; firstTarget?: string }> => {
  const firstTarget = parseFirstTarget(cleaned);
  // Try git‑apply via local shim (mockable)
  try {
    const modUnknown: unknown = await import('../apply');
    const runGitApply = pickRunGitApply(modUnknown);
    if (runGitApply) {
      const gitOut = await runGitApply({
        cwd,
        patchAbs: path.join(cwd, '.stan', 'patch', '.patch'),
        cleaned,
        stripOrder: [1, 0],
      });
      if (gitOut.ok) {
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
