/* src/stan/run/session/prompt-plan.ts
 * Prompt resolution and plan printing (with prompt line).
 */
import { renderRunPlan } from '@/stan/run/plan';
import { resolvePromptSource } from '@/stan/run/prompt';
import type { RunnerConfig } from '@/stan/run/types';
import type { ExecutionMode, RunBehavior, Selection } from '@/stan/run/types';
import type { RunnerUI } from '@/stan/run/ui';

export const resolvePromptOrThrow = (
  cwd: string,
  stanPath: string,
  promptChoice?: string,
): { display: string; abs: string } => {
  const choice = (promptChoice ?? 'auto').trim();
  const resolved = resolvePromptSource(cwd, stanPath, choice);
  const display =
    choice === 'auto' ? `auto → ${resolved.display}` : resolved.display;
  return { display, abs: resolved.abs };
};

/** Print the plan with a prompt: line injected (TTY-agnostic). */
export const printPlanWithPrompt = (
  cwd: string,
  args: {
    selection: Selection;
    config: RunnerConfig;
    mode: ExecutionMode;
    behavior: RunBehavior;
    planBody?: string;
    ui: RunnerUI;
    promptDisplay: string;
  },
): void => {
  const { selection, config, mode, behavior, planBody, ui, promptDisplay } =
    args;
  try {
    const planWithPrompt = renderRunPlan(cwd, {
      selection,
      config,
      mode,
      behavior: { ...behavior, prompt: promptDisplay },
    });
    ui.onPlan(planWithPrompt);
  } catch {
    // fallback to provided plan body if any
    if (typeof planBody === 'string' && planBody.length) ui.onPlan(planBody);
  }
  // Preserve legacy spacing parity after plan
  // (callers print this exactly once per run)

  console.log('');
};
