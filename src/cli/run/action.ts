/// src/cli/stan/run/action.ts
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { findConfigPathSync } from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import { CommanderError } from 'commander';

import { runDefaults } from '@/cli/cli-utils';
import { peekAndMaybeDebugLegacy } from '@/cli/config/peek';
import { printHeader } from '@/cli/header';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';
import * as effMod from '@/runner/config/effective';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';
import {
  computeFacetOverlay,
  type FacetOverlayOutput,
} from '@/runner/overlay/facets';
import { runSelected } from '@/runner/run';
import { renderRunPlan } from '@/runner/run/plan';
import type { RunnerConfig } from '@/runner/run/types';
import { updateDocsMetaOverlay } from '@/runner/system/docs-meta';
import { DBG_SCOPE_RUN_ENGINE_LEGACY } from '@/runner/util/debug-scopes';

import { deriveRunParameters } from './derive';
import type { FlagPresence } from './options';

// SSR-robust resolver for resolveEffectiveEngineConfig (named-or-default)
type EffModule = typeof import('@/runner/config/effective');
type ResolveEffFn = EffModule['resolveEffectiveEngineConfig'];
const resolveEffectiveEngineConfig: ResolveEffFn =
  resolveNamedOrDefaultFunction<ResolveEffFn>(
    effMod as unknown,
    (m) => (m as EffModule).resolveEffectiveEngineConfig,
    (m) =>
      (m as { default?: Partial<EffModule> }).default
        ?.resolveEffectiveEngineConfig,
    'resolveEffectiveEngineConfig',
  );

// Lazy SSR‑safe loader for cli config (named-or-default, resolved at action time)
const loadCliConfigSyncLazy = async (
  dir: string,
): Promise<{
  scripts?: Record<string, unknown>;
  cliDefaults?: Record<string, unknown>;
  patchOpenCommand?: string;
  maxUndos?: number;
  devMode?: boolean;
}> => {
  try {
    const mod = (await import('@/cli/config/load')) as unknown as {
      loadCliConfigSync?: (cwd: string) => unknown;
      default?:
        | { loadCliConfigSync?: (cwd: string) => unknown }
        | ((cwd: string) => unknown);
    };
    const named = (mod as { loadCliConfigSync?: unknown }).loadCliConfigSync;
    const viaDefaultObj = (mod as { default?: { loadCliConfigSync?: unknown } })
      .default?.loadCliConfigSync;
    const viaDefaultFn = (mod as { default?: unknown }).default;
    const fn =
      typeof named === 'function'
        ? (named as (cwd: string) => unknown)
        : typeof viaDefaultObj === 'function'
          ? (viaDefaultObj as (cwd: string) => unknown)
          : typeof viaDefaultFn === 'function'
            ? (viaDefaultFn as (cwd: string) => unknown)
            : null;
    const out = fn ? (fn(dir) as Record<string, unknown>) : {};
    return (out ?? {}) as {
      scripts?: Record<string, unknown>;
      cliDefaults?: Record<string, unknown>;
      patchOpenCommand?: string;
      maxUndos?: number;
      devMode?: boolean;
    };
  } catch {
    return {};
  }
};

export const registerRunAction = (
  cmd: Command,
  getFlagPresence: () => FlagPresence,
): void => {
  cmd.action(async (options: Record<string, unknown>) => {
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
    const config: ContextConfig = await resolveEffectiveEngineConfig(
      runCwd,
      'run.action:engine-legacy',
    );

    // CLI defaults and scripts for runner config/derivation (lazy SSR‑safe resolution)
    const cliCfg = await loadCliConfigSyncLazy(runCwd);

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
    // Narrow scripts map for derive step (default to empty map)
    const scriptsMap = cliCfg.scripts ?? {};
    // Narrow scripts default (boolean | string[] | undefined) from cliDefaults when present
    const scriptsDefaultCfg =
      (
        cliCfg.cliDefaults as
          | { run?: { scripts?: boolean | string[] } }
          | undefined
      )?.run?.scripts ?? undefined;

    const derived = deriveRunParameters({
      options,
      cmd,
      scripts: scriptsMap,
      scriptsDefault: scriptsDefaultCfg,
    });

    // Facet overlay — determine defaults and per-run overrides (renamed flags)
    const eff = runDefaults(runCwd);
    const src = cmd as unknown as {
      getOptionValueSource?: (name: string) => string | undefined;
    };
    const fromCli = (n: string) => src.getOptionValueSource?.(n) === 'cli';

    // -f, --facets [names...]     → overlay ON; activate listed facets; naked -f = all active
    // -F, --no-facets [names...]  → overlay ON; deactivate listed facets; naked -F = overlay OFF
    const toStringArray = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string')
        : [];

    const facetsOpt = (options as { facets?: unknown }).facets;
    const noFacetsOpt = (options as { noFacets?: unknown }).noFacets;

    const activateNames = toStringArray(facetsOpt);
    const deactivateNames = toStringArray(noFacetsOpt);

    const facetsProvided = fromCli('facets');
    const noFacetsProvided = fromCli('noFacets');

    const nakedActivateAll = facetsProvided && activateNames.length === 0;

    // Determine overlay enablement with new semantics
    let overlayEnabled = eff.facets;
    if (facetsProvided) overlayEnabled = true;
    if (noFacetsProvided)
      overlayEnabled = deactivateNames.length === 0 ? false : true;

    // Compute overlay for plan + engine inputs
    let overlay: FacetOverlayOutput | null = null;
    try {
      overlay = await computeFacetOverlay({
        cwd: runCwd,
        stanPath: config.stanPath,
        enabled: overlayEnabled,
        activate: activateNames.length ? activateNames : undefined,
        deactivate: deactivateNames.length ? deactivateNames : undefined,
        nakedActivateAll,
      });
    } catch {
      overlay = {
        enabled: overlayEnabled,
        excludesOverlay: [],
        anchorsOverlay: [],
        effective: {},
        autosuspended: [],
        anchorsKeptCounts: {},
        // diagnostics fallback (no overlay computed): nothing kept by default
        overlapKeptCounts: {},
      };
    }

    const runnerConfig: RunnerConfig = {
      stanPath: config.stanPath,
      // Narrow to string map for the runner; unknown entries are filtered at call sites
      // (script runner treats only string or {script:string} entries as runnable).
      scripts: (cliCfg.scripts ?? {}) as Record<string, string>,
      // Propagate selection context for the archive phase (legacy-friendly).
      includes: config.includes ?? [],
      excludes: [
        ...(config.excludes ?? []),
        ...((overlay?.enabled ? overlay.excludesOverlay : []) ?? []),
      ],
      imports: config.imports,
      // High-precedence re-includes (core enforces reserved denials/binary screen)
      ...(overlay?.anchorsOverlay?.length
        ? { anchors: overlay.anchorsOverlay }
        : {}),
      // Optional facet view lines for the plan
      overlayPlan: (() => {
        if (!overlay) return undefined;
        const lines: string[] = [];
        lines.push(`overlay: ${overlay.enabled ? 'on' : 'off'}`);
        if (overlay.enabled) {
          const inactive = Object.entries(overlay.effective)
            .filter(([, v]) => v === false)
            .map(([k]) => k);
          const auto = overlay.autosuspended;
          const anchorsTotal = Object.values(overlay.anchorsKeptCounts).reduce(
            (a, b) => a + b,
            0,
          );
          lines.push(
            `facets inactive: ${inactive.length ? inactive.join(', ') : 'none'}`,
          );
          if (auto.length) lines.push(`auto-suspended: ${auto.join(', ')}`);
          lines.push(`anchors kept: ${anchorsTotal.toString()}`);
        }
        return lines;
      })(),
    };

    const planBody = renderRunPlan(runCwd, {
      selection: derived.selection,
      config: runnerConfig,
      mode: derived.mode,
      behavior: derived.behavior,
    });

    const planOpt = (options as { plan?: unknown }).plan;
    const noPlanFlag = Boolean((options as { noPlan?: unknown }).noPlan);

    // Persist overlay metadata (best-effort)
    try {
      await updateDocsMetaOverlay(runCwd, config.stanPath, {
        enabled: overlay?.enabled ?? false,
        activated: activateNames,
        deactivated: deactivateNames,
        effective: overlay?.effective,
        autosuspended: overlay?.autosuspended,
        anchorsKept: overlay?.anchorsKeptCounts,
        overlapKept: overlay?.overlapKeptCounts,
      });
    } catch {
      /* best-effort */
    }

    // Default print-plan behavior from config
    // DRY: derive from runDefaults so runtime and help tagging share the same source.
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
      // Ensure the session honors the user/config prompt choice:
      //   - 'auto' (default) or an explicit 'local'|'core'|<path>
      //   - The session will print a single debug line under STAN_DEBUG=1
      //     identifying the chosen source/path.
      derived.promptChoice,
    );
  });
};
