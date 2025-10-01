/* src/stan/patch/run/pipeline.ts
 * Worktree-first patch application pipeline: git apply attempts across p1→p0, then jsdiff fallback.
 */
import type { ApplyResult } from '../apply';
import { buildApplyAttempts, runGitApply } from '../apply';
import type { JsDiffOutcome } from '../jsdiff';
import { applyWithJsDiff } from '../jsdiff';

export type PipelineOutcome = {
  ok: boolean;
  result: ApplyResult;
  js: JsDiffOutcome | null;
};

/** Apply a cleaned unified diff to the working tree (no staging). */
export const applyPatchPipeline = async (args: {
  cwd: string;
  patchAbs: string;
  cleaned: string;
  check: boolean;
  /** Attempt order; defaults to [1,0] (p1 then p0). */
  stripOrder?: number[];
}): Promise<PipelineOutcome> => {
  const { cwd, patchAbs, cleaned, check, stripOrder = [1, 0] } = args;

  // Git attempts (worktree only; never --index)
  const attempts = stripOrder.flatMap((p) =>
    buildApplyAttempts(check, p, false),
  );
  const result = await runGitApply(cwd, patchAbs, attempts);
  if (result.ok) {
    return { ok: true, result, js: null };
  }

  // jsdiff fallback (unstaged; sandbox when --check)
  const js = await applyWithJsDiff({
    cwd,
    cleaned,
    check,
  });

  if (js.okFiles.length > 0 && js.failed.length === 0) {
    return { ok: true, result, js };
  }

  return { ok: false, result, js };
};
