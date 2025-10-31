// src/runner/run/session/run-session/steps/prompt.ts
import {
  printPlanWithPrompt,
  resolvePromptOrThrow,
} from '@/runner/run/session/prompt-plan';
import type { RunnerConfig } from '@/runner/run/types';
import type { ExecutionMode, RunBehavior } from '@/runner/run/types';
import type { RunnerUI } from '@/runner/run/ui';

/** Result of resolving prompt for the session. */
export type ResolvedPrompt = {
  display: string;
  abs: string | null;
};

/**
 * Resolve the prompt to use and (optionally) print the plan with the resolved prompt line.
 *
 * - Uses resolvePromptOrThrow to obtain the effective source.
 * - On resolution failure, prints a warning and proceeds in non-ephemeral mode.
 * - When planBody/printPlan indicate, prints the plan with a prompt: line injected.
 *
 * Returns the resolved prompt display string and absolute path (or null).
 */
export function resolvePromptAndMaybePrintPlan(args: {
  cwd: string;
  config: RunnerConfig;
  selection: string[];
  mode: ExecutionMode;
  behavior: RunBehavior;
  ui: RunnerUI;
  planBody?: string;
  printPlan?: boolean;
  promptChoice?: string;
}): ResolvedPrompt {
  const {
    cwd,
    config,
    selection,
    mode,
    behavior,
    ui,
    planBody,
    printPlan,
    promptChoice,
  } = args;

  let resolvedPromptDisplay = '';
  let resolvedPromptAbs: string | null = null;
  try {
    const rp = resolvePromptOrThrow(cwd, config.stanPath, promptChoice);
    resolvedPromptDisplay = rp.display;
    resolvedPromptAbs = rp.abs;
    try {
      if (process.env.STAN_DEBUG === '1') {
        const srcKind =
          (rp as unknown as { kind?: 'local' | 'core' | 'path' }).kind ||
          'path';
        const p = (resolvedPromptAbs || '').replace(/\\/g, '/');
        console.error(`stan: debug: prompt: ${srcKind} ${p}`);
      }
    } catch {
      /* ignore */
    }
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === 'string' ? e : String(e);
    console.error(
      `stan: warn: proceeding without resolved system prompt (${msg})`,
    );
    console.log('');
    resolvedPromptDisplay = 'auto (unresolved)';
    resolvedPromptAbs = null;
  }

  if (printPlan && planBody) {
    try {
      printPlanWithPrompt(cwd, {
        selection,
        config,
        mode,
        behavior,
        planBody,
        ui,
        promptDisplay: resolvedPromptDisplay,
      });
    } catch {
      /* ignore plan print failure */
    }
  }
  return { display: resolvedPromptDisplay, abs: resolvedPromptAbs };
}
