// src/runner/run/session/archive-stage/prompt-ephemeral.ts
import path from 'node:path';

import { readDocsMeta } from '@/runner/system/docs-meta';
import { sha256File } from '@/runner/util/hash';

/** True when the resolved prompt source is not the local system file. */
export const isEphemeralPrompt = (
  systemAbs: string,
  promptAbs: string | null,
): boolean => {
  if (!promptAbs) return false;
  try {
    return path.resolve(promptAbs) !== path.resolve(systemAbs);
  } catch {
    return true;
  }
};

/**
 * Decide whether to include the prompt in DIFF (changed‑only) vs keep it quiet.
 * - Missing docs meta or prompt fields ⇒ include‑on‑change (true).
 * - Hashing failure ⇒ prefer quiet diff (false).
 */
export const decideIncludeOnChange = async (args: {
  cwd: string;
  stanPath: string;
  promptAbs: string | null;
}): Promise<boolean> => {
  const { cwd, stanPath, promptAbs } = args;
  // Default to suppress when we cannot decide safely (no baseline yet).
  let includeOnChange = false;
  let currentHash: string | undefined;
  try {
    if (promptAbs) currentHash = await sha256File(promptAbs);
  } catch {
    currentHash = undefined;
  }
  try {
    const meta = await readDocsMeta(cwd, stanPath);
    const baseline =
      meta?.prompt && typeof meta.prompt === 'object'
        ? (meta.prompt as { hash?: string }).hash
        : undefined;
    if (baseline && currentHash) {
      includeOnChange = baseline !== currentHash;
    } else if (!baseline) {
      includeOnChange = false;
    } else if (!currentHash) {
      includeOnChange = false;
    }
  } catch {
    includeOnChange = false;
  }
  return includeOnChange;
};
