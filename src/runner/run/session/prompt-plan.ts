/* src/stan/run/session/prompt-plan.ts
 * Prompt resolution and plan printing (with prompt line).
 */
import { renderRunPlan } from '@/runner/run/plan';
import { resolvePromptSource } from '@/runner/run/prompt';
import type { RunnerConfig } from '@/runner/run/types';
import type { ExecutionMode, RunBehavior, Selection } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

export const resolvePromptOrThrow = (
  cwd: string,
  stanPath: string,
  promptChoice?: string,
): { display: string; abs: string; kind: 'local' | 'core' | 'path' } => {
  const choice = (promptChoice ?? 'auto').trim();
  const resolved = resolvePromptSource(cwd, stanPath, choice);
  const display =
    choice === 'auto' ? `auto → ${resolved.display}` : resolved.display;
  return { display, abs: resolved.abs, kind: resolved.kind };
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
