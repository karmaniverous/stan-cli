import { rm } from 'node:fs/promises';
import path from 'node:path';

import { ensureOutputDir } from '@karmaniverous/stan-core';

import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
// Note: under SSR/tests, the helper above can be unavailable or reshaped; we guard for that below.
import type { RunnerConfig } from '@/runner/run/types';

import * as planMod from './plan';
import * as sessionMod from './session';
import type { ExecutionMode, RunBehavior } from './types';
import type { RunnerUI } from './ui';
import * as uiMod from './ui';

// SSR‑robust resolver for renderRunPlan (named or default)
type PlanModule = typeof import('./plan');
type RenderRunPlanFn = PlanModule['renderRunPlan'];

// SSR/test-robust wrapper: prefer the helper when callable; otherwise manually pick named/default.
const tryResolveNamedOrDefault = <F>(
  mod: unknown,
  pickNamed: (m: unknown) => F | undefined,
  pickDefault: (m: unknown) => F | undefined,
  label?: string,
): F => {
  try {
    if (typeof resolveNamedOrDefaultFunction === 'function') {
      return resolveNamedOrDefaultFunction<F>(
        mod,
        pickNamed,
        pickDefault,
        label,
      );
    }
  } catch {
    // ignore helper failures and attempt manual resolution
  }
  try {
    const named = pickNamed(mod);
    if (typeof named === 'function') return named as F;
  } catch {
    /* ignore */
  }
  try {
    const viaDefault = pickDefault(mod);
    if (typeof viaDefault === 'function') return viaDefault as F;
  } catch {
    /* ignore */
  }
  const what = label && label.trim().length ? label.trim() : 'export';
  throw new Error(`resolveNamedOrDefaultFunction: ${what} not found`);
};

const getRenderRunPlan = (): RenderRunPlanFn => {
  try {
    return tryResolveNamedOrDefault<RenderRunPlanFn>(
      planMod as unknown,
      (m) => (m as PlanModule).renderRunPlan,
      (m) => (m as { default?: Partial<PlanModule> }).default?.renderRunPlan,
      'renderRunPlan',
    );
  } catch (e) {
    // Extra fallback: accept default export when it is a callable function
    const def = (planMod as unknown as { default?: unknown }).default;
    if (typeof def === 'function') {
      return def as RenderRunPlanFn;
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
};

// SSR‑robust resolver for runSessionOnce (named or default)
type SessionModule = typeof import('./session');
type RunSessionOnceFn = SessionModule['runSessionOnce'];
const getRunSessionOnce = (): RunSessionOnceFn => {
  try {
    return tryResolveNamedOrDefault<RunSessionOnceFn>(
      sessionMod as unknown,
      (m) => (m as SessionModule).runSessionOnce,
      (m) =>
        (m as { default?: Partial<SessionModule> }).default?.runSessionOnce,
      'runSessionOnce',
    );
  } catch (e) {
    // Extra fallback: accept default export when it is a callable function
    const def = (sessionMod as unknown as { default?: unknown }).default;
    if (typeof def === 'function') {
      return def as RunSessionOnceFn;
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
};

const resolveUI = (): {
  LiveUICtor?: new (opts?: { boring?: boolean }) => RunnerUI;
  LoggerUICtor?: new () => RunnerUI;
} => {
  const mod = uiMod as unknown as {
    LiveUI?: unknown;
    LoggerUI?: unknown;
    default?: { LiveUI?: unknown; LoggerUI?: unknown };
  };
  const Live = (
    typeof mod.LiveUI === 'function'
      ? (mod.LiveUI as unknown)
      : typeof mod.default?.LiveUI === 'function'
        ? (mod.default.LiveUI as unknown)
        : undefined
  ) as (new (opts?: { boring?: boolean }) => RunnerUI) | undefined;
  const Logger = (
    typeof mod.LoggerUI === 'function'
      ? (mod.LoggerUI as unknown)
      : typeof mod.default?.LoggerUI === 'function'
        ? (mod.default.LoggerUI as unknown)
        : undefined
  ) as (new () => RunnerUI) | undefined;
  return { LiveUICtor: Live, LoggerUICtor: Logger };
};

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
  const planBody = getRenderRunPlan()(cwd, {
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
  const { LiveUICtor, LoggerUICtor } = resolveUI();
  const ui: RunnerUI =
    liveEnabled && typeof LiveUICtor === 'function'
      ? new LiveUICtor({ boring: process.env.STAN_BORING === '1' })
      : typeof LoggerUICtor === 'function'
        ? new LoggerUICtor()
        : // Extremely defensive: fall back to a logger-like no-op to avoid throwing in tests.
          ({
            start() {},
            onPlan() {},
            onScriptQueued() {},
            onScriptStart() {},
            onScriptEnd() {},
            onArchiveQueued() {},
            onArchiveStart() {},
            onArchiveEnd() {},
            onCancelled() {},
            installCancellation() {},
            stop() {},
          } as unknown as RunnerUI);

  // Outer loop: allow live-mode restart (press 'r') to repeat a session once per trigger.
  let printedPlan = false;
  for (;;) {
    const { created, cancelled, restartRequested } = await getRunSessionOnce()({
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
      // Secondary guard: ensure on-disk archives are absent on cancellation
      // even if a late race created them; best-effort only.
      try {
        const outAbs = path.join(cwd, config.stanPath, 'output');
        await Promise.allSettled([
          rm(path.join(outAbs, 'archive.tar'), { force: true }),
          rm(path.join(outAbs, 'archive.diff.tar'), { force: true }),
        ]);
      } catch {
        /* ignore */
      }
      // Brief settle to reflect deletions across platforms
      try {
        await new Promise((r) =>
          setTimeout(r, process.platform === 'win32' ? 30 : 15),
        );
      } catch {
        /* ignore */
      }
      // Cancelled (non-restart): session already stopped UI and printed spacing.
      // Brief settle to ensure any best-effort deletions (archives) are reflected.
      try {
        const ms = process.platform === 'win32' ? 30 : process.env.CI ? 20 : 15;
        await new Promise((r) => setTimeout(r, ms));
      } catch {
        /* ignore */
      }
      return created;
    }
    // Normal completion: stop UI once for the whole run, then print trailing spacing.
    try {
      ui.stop();
    } catch {
      /* ignore */
    }
    // Minor settle to stabilize FS visibility (archives, outputs) for immediate assertions.
    try {
      const ms = process.platform === 'win32' ? 30 : process.env.CI ? 20 : 15;
      await new Promise((r) => setTimeout(r, ms));
    } catch {
      /* ignore */
    }
    return created;
  }
};
