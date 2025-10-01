import type { ContextConfig } from '@/stan/config';
import { ensureOutputDir } from '@/stan/config';

import { preflightDocsAndVersion } from '../preflight';
import { renderRunPlan } from './plan';
import { runSessionOnce } from './session';
import type { ExecutionMode, RunBehavior } from './types';

/**
 * High‑level runner for `stan run`.
 *
 * Responsibilities:
 * - Preflight docs/version (best‑effort).
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
 * @returns Absolute paths to created artifacts (script outputs and/or archives).
 */
export const runSelected = async (
  cwd: string,
  config: ContextConfig,
  selection: string[] | null = null,
  mode: ExecutionMode = 'concurrent',
  behaviorMaybe?: RunBehavior,
): Promise<string[]> => {
  const behavior: RunBehavior = behaviorMaybe ?? {};

  // Preflight docs/version (non-blocking; best-effort)
  try {
    await preflightDocsAndVersion(cwd);
  } catch (err) {
    if (process.env.STAN_DEBUG === '1') {
      const msg = err instanceof Error ? err.message : String(err);

      console.error('stan: preflight failed', msg);
    }
  }

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
    });
    printedPlan = true;

    if (restartRequested) {
      // Next iteration (live restart)
      continue;
    }
    if (cancelled) {
      return created;
    }
    return created;
  }
};
