import { ensureOutputDir } from '@karmaniverous/stan-core';

import type { RunnerConfig } from '@/stan/run/types';

import { renderRunPlan } from './plan';
import { runSessionOnce } from './session';
import type { ExecutionMode, RunBehavior } from './types';
import { LiveUI, LoggerUI, type RunnerUI } from './ui';

/**
 * High‑level runner for `stan run`.
 *
 * Responsibilities: * - Preflight docs/version (best‑effort).
 * - Ensure output/diff directories.
 * - Print the run plan.
 * - Execute selected scripts (in the chosen mode).
 * - Optionally create regular and diff archives (combine/keep behaviors).
 *
 * @param cwd - Repo root for execution.
 * @param config - Resolved configuration.
 * @param selection - Explicit list of script keys (or `null` to run all).
 * @param mode - Execution mode (`concurrent` by default).
 * @param behaviorMaybe - Archive/combine/keep flags.
 * @param promptChoice - System prompt choice (auto|local|core|<path>) to honor during the run.
 * @returns Absolute paths to created artifacts (script outputs and/or archives).
 */
export const runSelected = async (
  cwd: string,
  config: RunnerConfig,
  selection: string[] | null = null,
  mode: ExecutionMode = 'concurrent',
  behaviorMaybe?: RunBehavior,
  promptChoice?: string,
): Promise<string[]> => {
  const behavior: RunBehavior = behaviorMaybe ?? {};

  // Ensure workspace (also manages archive.prev when keep=false)
  await ensureOutputDir(cwd, config.stanPath, Boolean(behavior.keep));

  // Multi-line plan summary
  const planBody = renderRunPlan(cwd, {
    selection,
    config,
    mode,
    behavior,
  });

  // Live enablement respects CLI/config and TTY
  const stdoutLike = process.stdout as unknown as { isTTY?: boolean };
  const isTTY = Boolean(stdoutLike?.isTTY);
  const liveEnabled = (behavior.live ?? true) && isTTY;

  // Resolve final selection list
  const selected = selection == null ? Object.keys(config.scripts) : selection;

  // Create a single UI instance for the entire run; reuse across restarts.
  const ui: RunnerUI = liveEnabled
    ? new LiveUI({ boring: process.env.STAN_BORING === '1' })
    : new LoggerUI();

  // Outer loop: allow live-mode restart (press 'r') to repeat a session once per trigger.
  let printedPlan = false;
  for (;;) {
    const { created, cancelled, restartRequested } = await runSessionOnce({
      cwd,
      config,
      selection: selected,
      mode,
      behavior,
      liveEnabled,
      planBody,
      printPlan: !printedPlan && behavior.plan !== false,
      ui,
      // Honor CLI/system choice for prompt resolution within the session.
      promptChoice,
    });
    printedPlan = true;

    if (restartRequested) {
      // Next iteration (live restart)
      continue;
    }
    if (cancelled) {
      // Cancelled (non-restart): session already stopped UI and printed spacing.
      return created;
    }
    // Normal completion: stop UI once for the whole run, then print trailing spacing.
    try {
      ui.stop();
    } catch {
      /* ignore */
    }
    return created;
  }
};
