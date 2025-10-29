// src/runner/run/session/archive-stage/prompt-prepare.ts
import { preparePromptForArchive } from '@/runner/run/prompt';

/**
 * Materialize the prompt under <stanPath>/system/stan.system.md when needed.
 * Returns a restore() that reverts the file on completion.
 * Throws with a concise error message on failure.
 */
export const preparePromptOrThrow = async (args: {
  cwd: string;
  stanPath: string;
  promptAbs: string;
  promptDisplay: string;
}): Promise<() => Promise<void>> => {
  const { cwd, stanPath, promptAbs, promptDisplay } = args;
  try {
    const { restore } = await preparePromptForArchive(cwd, stanPath, {
      abs: promptAbs,
      display: promptDisplay,
      kind: 'path',
    });
    return restore;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
};
