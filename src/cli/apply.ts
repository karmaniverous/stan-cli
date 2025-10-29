// src/cli/apply.ts
// Thin adapter to align CLI tests that mock "./apply" with the current
// engine pipeline. In production, this delegates to stan-core’s
// applyPatchPipeline and returns only the structured apply result.
import type { ApplyResult } from '@karmaniverous/stan-core';
import { applyPatchPipeline } from '@karmaniverous/stan-core';

/** Present for compatibility with older/mocked test shapes. */
export const buildApplyAttempts = (): string[] => {
  return [];
};

/**
 * Git-apply attempt wrapper (delegates to the engine pipeline).
 * When mocked in tests, this function can force a failure path so the
 * caller falls back to jsdiff.
 */
export const runGitApply = async (args: {
  cwd: string;
  patchAbs: string;
  cleaned: string;
  stripOrder?: number[];
}): Promise<ApplyResult> => {
  const { cwd, patchAbs, cleaned, stripOrder } = args;
  const out = await applyPatchPipeline({
    cwd,
    patchAbs,
    cleaned,
    check: false,
    stripOrder:
      Array.isArray(stripOrder) && stripOrder.length > 0 ? stripOrder : [1, 0],
  });
  return out.result;
};

export default {
  buildApplyAttempts,
  runGitApply,
};
