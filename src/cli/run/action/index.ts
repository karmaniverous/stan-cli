import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import {
  findConfigPathSync,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import type { Command } from 'commander';

import { loadCliConfigSync } from '@/cli/config/load';
import { peekAndMaybeDebugLegacy } from '@/cli/config/peek';
import { deriveRunParameters } from '@/cli/run/derive';
import { getRunDefaults } from '@/cli/run/derive/run-defaults';
import { resolveEffectiveEngineConfig } from '@/runner/config/effective';
import { runSelected } from '@/runner/run';
import { renderRunPlan } from '@/runner/run/plan';
import type { RunnerConfig } from '@/runner/run/types';
import { updateDocsMetaOverlay } from '@/runner/system/docs-meta';
import { DBG_SCOPE_RUN_ENGINE_LEGACY } from '@/runner/util/debug-scopes';

import type { FlagPresence } from '../options';
import { assertNoScriptsConflict } from './conflict';
import { runLoopHeaderAndGuard } from './loop';
import type { ResolvedOverlayForRun } from './overlay-flow';
import { resolveOverlayForRun } from './overlay-flow';
import { makeRunnerConfig } from './runner-config';
import { resolveScriptsForRun } from './scripts';

export const registerRunAction = (
  cmd: Command,
  getFlagPresence: () => FlagPresence,
): void => {
  cmd.action(async (options: Record<string, unknown>) => {
    // Hard guard: -S vs -s/-x
    assertNoScriptsConflict(getFlagPresence());

    const cwdInitial = process.cwd();
    const cfgPath = findConfigPathSync(cwdInitial);
    const runCwd = cfgPath ? path.dirname(cfgPath) : cwdInitial;

    // Early legacy-engine notice remains in options preAction hook; here we resolve
    // effective engine context (namespaced or legacy) for the runner.
    await peekAndMaybeDebugLegacy(DBG_SCOPE_RUN_ENGINE_LEGACY, runCwd);
    // Engine config (SSR/mocks-robust)
    const config: ContextConfig = await (async () => {
      try {
        return await resolveEffectiveEngineConfig(
          runCwd,
          DBG_SCOPE_RUN_ENGINE_LEGACY,
        );
      } catch {
        try {
          const sp = resolveStanPathSync(runCwd);
          return { stanPath: sp } as ContextConfig;
        } catch {
          return { stanPath: '.stan' } as ContextConfig;
        }
      }
    })();

    // CLI defaults and scripts for runner config/derivation
    const cliCfg = loadCliConfigSync(runCwd);

    // Loop guard (header + reversal)
    {
      const proceed = await runLoopHeaderAndGuard(runCwd, config.stanPath);
      if (!proceed) return;
    }

    // Scripts map + default selection (namespaced first; legacy fallback)
    const { scriptsMap, scriptsDefault } = await resolveScriptsForRun({
      cwd: runCwd,
      cliCfg,
    });

    const derived = deriveRunParameters({
      options,
      cmd,
      scripts: scriptsMap,
      scriptsDefault,
      dir: runCwd,
    });

    // Overlay mapping (defaults + per-run overrides; SSR-safe)
    const resolvedOverlay: ResolvedOverlayForRun = await resolveOverlayForRun({
      cwd: runCwd,
      stanPath: config.stanPath,
      cmd,
      options,
    });
    const { overlayInputs, overlayEnabled, activateNames, deactivateNames } =
      resolvedOverlay;

    // Defensive: ensure live default honors config when CLI flag not provided.
    try {
      const liveProvided =
        Object.prototype.hasOwnProperty.call(options, 'live') &&
        typeof (options as { live?: unknown }).live === 'boolean';
      if (!liveProvided) {
        derived.behavior.live = getRunDefaults(runCwd).live;
      }
    } catch {
      /* best-effort */
    }

    // Compose runner config from parts
    const runnerConfig: RunnerConfig = makeRunnerConfig({
      config,
      scriptsMap: scriptsMap,
      engineExcludes: overlayInputs.engineExcludes,
      anchors: overlayInputs.overlay?.anchorsOverlay,
      overlayPlan: overlayInputs.overlayPlan,
    });

    const planBody = renderRunPlan(runCwd, {
      selection: derived.selection,
      config: runnerConfig,
      mode: derived.mode,
      behavior: derived.behavior,
    });

    const planOpt = (options as { plan?: unknown }).plan;
    const noPlanFlag = Boolean((options as { noPlan?: unknown }).noPlan);

    // v2 semantics: when no scripts are selected by defaults and archive is disabled by defaults,
    // behave as plan-only (nothing to do) even without explicit -S/-A flags.
    if (
      Array.isArray(derived.selection) &&
      derived.selection.length === 0 &&
      derived.behavior.archive === false
    ) {
      console.log(
        'stan: nothing to do; plan only (no scripts selected, archive disabled)',
      );
      console.log(planBody);
      return;
    }

    // Persist overlay metadata (best-effort)
    try {
      await updateDocsMetaOverlay(runCwd, config.stanPath, {
        enabled: overlayEnabled,
        activated: activateNames,
        deactivated: deactivateNames,
        effective: overlayInputs.overlay?.effective,
        autosuspended: overlayInputs.overlay?.autosuspended,
        anchorsKept: overlayInputs.overlay?.anchorsKeptCounts,
        overlapKept: overlayInputs.overlay?.overlapKeptCounts,
      });
    } catch {
      /* best-effort */
    }

    const defaultPrintPlan = getRunDefaults(runCwd).plan;

    const noScripts = (options as { scripts?: unknown }).scripts === false;
    if (noScripts && derived.behavior.archive === false) {
      console.log(
        'stan: nothing to do; plan only (scripts disabled, archive disabled)',
      );
      console.log(planBody);
      return;
    }

    const planOnly = planOpt === true;
    if (planOnly) {
      console.log(planBody);
      return;
    }

    let printPlan = defaultPrintPlan;
    if (noPlanFlag || planOpt === false) {
      printPlan = false;
    }
    (derived.behavior as { plan?: boolean }).plan = printPlan;

    await runSelected(
      runCwd,
      runnerConfig,
      derived.selection,
      derived.mode,
      derived.behavior,
      derived.promptChoice,
    );
  });
};

// SSR-robust fallback export for modules that use a default export shape:
// also provide a callable default that delegates to the named function.
export default function defaultRegisterRunAction(
  cmd: Command,
  getFlagPresence: () => FlagPresence,
): void {
  // Delegate to the canonical implementation
  registerRunAction(cmd, getFlagPresence);
}
