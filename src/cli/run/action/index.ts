import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { findConfigPathSync } from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import { CommanderError } from 'commander';

import { runDefaults } from '@/cli/cli-utils';
import { peekAndMaybeDebugLegacy } from '@/cli/config/peek';
import { printHeader } from '@/cli/header';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';
import { runSelected } from '@/runner/run';
import { renderRunPlan } from '@/runner/run/plan';
import type { RunnerConfig } from '@/runner/run/types';
import { updateDocsMetaOverlay } from '@/runner/system/docs-meta';
import { DBG_SCOPE_RUN_ENGINE_LEGACY } from '@/runner/util/debug-scopes';

import type { FlagPresence } from '../options';
import { loadCliConfigSyncLazy, loadDeriveRunParameters } from './loaders';
import { buildOverlayInputs } from './overlay';
import { getOptionSource, toStringArray } from './util';

export const registerRunAction = (
  cmd: Command,
  getFlagPresence: () => FlagPresence,
): void => {
  cmd.action(async (options: Record<string, unknown>) => {
    // Resolve engine config lazily with SSR‑robust named‑or‑default selection.
    const getResolveEngineConfig = async (): Promise<
      (cwd: string) => Promise<ContextConfig>
    > => {
      const mod = (await import('./loaders')) as unknown;
      try {
        return resolveNamedOrDefaultFunction<
          (c: string) => Promise<ContextConfig>
        >(
          mod,
          (m) =>
            (m as { resolveEngineConfigLazy?: unknown })
              .resolveEngineConfigLazy as
              | ((c: string) => Promise<ContextConfig>)
              | undefined,
          (m) =>
            (m as { default?: { resolveEngineConfigLazy?: unknown } }).default
              ?.resolveEngineConfigLazy as
              | ((c: string) => Promise<ContextConfig>)
              | undefined,
          'resolveEngineConfigLazy',
        );
      } catch (e) {
        const def = (mod as { default?: unknown }).default;
        if (typeof def === 'function')
          return def as unknown as (c: string) => Promise<ContextConfig>;
        throw e instanceof Error ? e : new Error(String(e));
      }
    };
    const { sawNoScriptsFlag, sawScriptsFlag, sawExceptFlag } =
      getFlagPresence();
    // Authoritative conflict handling: -S cannot be combined with -s/-x
    if (sawNoScriptsFlag && (sawScriptsFlag || sawExceptFlag)) {
      throw new CommanderError(
        1,
        'commander.conflictingOption',
        "error: option '-S, --no-scripts' cannot be used with option '-s, --scripts' or '-x, --except-scripts'",
      );
    }

    const cwdInitial = process.cwd();
    const cfgPath = findConfigPathSync(cwdInitial);
    const runCwd = cfgPath ? path.dirname(cfgPath) : cwdInitial;

    // Early legacy-engine notice remains in options preAction hook; here we resolve
    // effective engine context (namespaced or legacy) for the runner.
    await peekAndMaybeDebugLegacy(DBG_SCOPE_RUN_ENGINE_LEGACY, runCwd);
    const resolveEngineConfig = await getResolveEngineConfig();
    const config: ContextConfig = await resolveEngineConfig(runCwd);

    // CLI defaults and scripts for runner config/derivation (lazy SSR‑safe resolution)
    const cliCfg = await loadCliConfigSyncLazy(runCwd);

    // Derivation function (SSR-safe)
    const deriveRunParameters = await loadDeriveRunParameters();

    // Safe wrapper for Commander’s getOptionValueSource (avoid unbound method usage)
    const getSrc = (name: string): string | undefined =>
      getOptionSource(cmd, name);

    // Loop header + reversal guard
    try {
      const st = await readLoopState(runCwd, config.stanPath);
      printHeader('run', st?.last ?? null);
      if (st?.last && isBackward(st.last, 'run')) {
        const proceed = await confirmLoopReversal();
        if (!proceed) {
          console.log('');
          return;
        }
      }
      // Update state at command start (so it reflects the action initiated)
      try {
        const ts = new Date().toISOString();
        await writeLoopState(runCwd, config.stanPath, 'run', ts);
      } catch {
        // best-effort
      }
    } catch {
      // ignore guard failures
    }

    // Derive run parameters
    // 1) Scripts: prefer CLI loader; fall back to direct config parse (namespaced or legacy root).
    let scriptsMap = cliCfg.scripts ?? {};
    if (!scriptsMap || Object.keys(scriptsMap).length === 0) {
      try {
        const { readCliScriptsFallback } = await import('../config-fallback');
        scriptsMap = readCliScriptsFallback(runCwd);
      } catch {
        scriptsMap = {};
      }
    }
    // 2) Default selection: prefer CLI loader; fall back to direct config parse (namespaced or legacy root).
    let scriptsDefaultCfg: boolean | string[] | undefined = (
      (cliCfg.cliDefaults as
        | { run?: { scripts?: boolean | string[] } }
        | undefined) ?? {}
    )?.run?.scripts;
    if (typeof scriptsDefaultCfg === 'undefined') {
      try {
        const { readRunScriptsDefaultFallback } = await import(
          '../config-fallback'
        );
        scriptsDefaultCfg = readRunScriptsDefaultFallback(runCwd);
      } catch {
        /* ignore */
      }
    }

    const derived = deriveRunParameters({
      options,
      cmd,
      scripts: scriptsMap,
      scriptsDefault: scriptsDefaultCfg,
      dir: runCwd,
    });

    // Facet overlay — determine defaults and per-run overrides (renamed flags)
    const eff = runDefaults(runCwd);
    const facetsOpt = (options as { facets?: unknown }).facets;
    const noFacetsOpt = (options as { noFacets?: unknown }).noFacets;

    const activateNames = toStringArray(facetsOpt);
    const deactivateNames = toStringArray(noFacetsOpt);

    const facetsProvided = getSrc('facets') === 'cli';
    const noFacetsProvided = getSrc('noFacets') === 'cli';
    const nakedActivateAll = facetsProvided && activateNames.length === 0;

    // Determine overlay enablement with new semantics
    let overlayEnabled = eff.facets;
    if (facetsProvided) overlayEnabled = true;
    if (noFacetsProvided)
      overlayEnabled = deactivateNames.length === 0 ? false : true;

    const overlayInputs = await buildOverlayInputs({
      cwd: runCwd,
      stanPath: config.stanPath,
      enabled: overlayEnabled,
      activateNames,
      deactivateNames,
      nakedActivateAll,
    });

    // Defensive: ensure live default honors config when CLI flag not provided.
    try {
      const liveProvided =
        Object.prototype.hasOwnProperty.call(options, 'live') &&
        typeof (options as { live?: unknown }).live === 'boolean';
      if (!liveProvided) {
        derived.behavior.live = eff.live;
      }
    } catch {
      /* best-effort */
    }

    const runnerConfig: RunnerConfig = {
      stanPath: config.stanPath,
      scripts: (scriptsMap ?? {}) as Record<string, string>,
      includes: config.includes ?? [],
      excludes: [...(config.excludes ?? []), ...overlayInputs.engineExcludes],
      imports: config.imports,
      ...(overlayInputs.overlay?.anchorsOverlay?.length
        ? { anchors: overlayInputs.overlay.anchorsOverlay }
        : {}),
      overlayPlan: overlayInputs.overlayPlan,
    };

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
        enabled: overlayInputs.overlay?.enabled ?? false,
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

    const defaultPrintPlan = runDefaults(runCwd).plan;

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
