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

// SSR‑robust fallback readers for scripts and cliDefaults.run.scripts
import {
  readCliScriptsFallback,
  readRunScriptsDefaultFallback,
} from './config-fallback';
import type { FlagPresence } from './options';

// Lazy resolver for CLI config (named-or-default) at action time.
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

// Lazy resolver for the effective engine config (named-or-default at action time).
const resolveEngineConfigLazy = async (cwd: string): Promise<ContextConfig> => {
  try {
    const mod = (await import('@/runner/config/effective')) as unknown;
    const fn = resolveNamedOrDefaultFunction<
      (cwd: string, scope?: string) => Promise<ContextConfig>
    >(
      mod,
      (m) =>
        (
          m as {
            resolveEffectiveEngineConfig?: (
              c: string,
              s?: string,
            ) => Promise<ContextConfig>;
          }
        ).resolveEffectiveEngineConfig,
      (m) =>
        (
          m as {
            default?: {
              resolveEffectiveEngineConfig?: (
                c: string,
                s?: string,
              ) => Promise<ContextConfig>;
            };
          }
        ).default?.resolveEffectiveEngineConfig,
      'resolveEffectiveEngineConfig',
    );
    return await fn(cwd, 'run.action:engine-legacy');
  } catch {
    // Safe fallback: minimal config (stanPath only).
    try {
      const core = await import('@karmaniverous/stan-core');
      const sp =
        typeof core.resolveStanPathSync === 'function'
          ? core.resolveStanPathSync(cwd)
          : '.stan';
      return { stanPath: sp } as ContextConfig;
    } catch {
      return { stanPath: '.stan' } as ContextConfig;
    }
  }
};

export const registerRunAction = (
  cmd: Command,
  getFlagPresence: () => FlagPresence,
): void => {
  // SSR‑robust lazy loader for deriveRunParameters
  const loadDerive = async (): Promise<{
    deriveRunParameters: (args: {
      options: Record<string, unknown>;
      cmd: Command;
      scripts: Record<string, unknown>;
      scriptsDefault?: boolean | string[];
      dir?: string;
    }) => {
      selection: string[];
      mode: import('@/runner/run').ExecutionMode;
      behavior: import('@/runner/run').RunBehavior;
      promptChoice: string;
    };
  }> => {
    const mod = (await import('./derive')) as unknown as {
      deriveRunParameters?: unknown;
      default?: unknown;
    };
    const named = (mod as { deriveRunParameters?: unknown })
      .deriveRunParameters;
    if (typeof named === 'function') {
      return {
        deriveRunParameters:
          named as unknown as typeof import('./derive').deriveRunParameters,
      };
    }
    const defAny = (mod as { default?: unknown }).default;
    if (
      defAny &&
      typeof (defAny as { deriveRunParameters?: unknown })
        .deriveRunParameters === 'function'
    ) {
      return {
        deriveRunParameters: (
          defAny as {
            deriveRunParameters: typeof import('./derive').deriveRunParameters;
          }
        ).deriveRunParameters,
      };
    }
    if (typeof defAny === 'function') {
      return {
        deriveRunParameters:
          defAny as unknown as typeof import('./derive').deriveRunParameters,
      };
    }
    throw new Error('deriveRunParameters not found');
  };

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
    const config: ContextConfig = await resolveEngineConfigLazy(runCwd);

    // CLI defaults and scripts for runner config/derivation (lazy SSR‑safe resolution)
    const cliCfg = await loadCliConfigSyncLazy(runCwd);

    // Derivation function (SSR-safe)
    const { deriveRunParameters } = await loadDerive();

    // Safe wrapper for Commander’s getOptionValueSource (avoid unbound method usage)
    const getOptionSource = (name: string): string | undefined => {
      const fn = (
        cmd as unknown as {
          getOptionValueSource?: (n: string) => string | undefined;
        }
      ).getOptionValueSource;
      return typeof fn === 'function' ? fn.call(cmd, name) : undefined;
    };

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
    const fromCli = (n: string) => getOptionSource(n) === 'cli';

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
        overlapKeptCounts: {},
      };
    }

    // Map overlay excludes to effective deny-list globs for the engine:
    // - subtree roots like "docs" -> "docs/**"
    // - existing glob patterns (contain *, ?, or [) pass through unchanged.
    const overlayExcludesRaw =
      overlay && overlay.enabled ? (overlay.excludesOverlay ?? []) : [];
    const hasGlob = (s: string): boolean =>
      s.includes('*') || s.includes('?') || s.includes('[');
    const ensureSubtreeGlob = (p: string): string => {
      const s = p.replace(/\/+$/, '');
      return hasGlob(s) ? s : `${s}/**`;
    };
    const overlayExcludes = overlayExcludesRaw.map(ensureSubtreeGlob);

    // Also include leaf-glob excludes from inactive facets (e.g., "**/*.test.ts").
    // Read facet.meta.json directly and derive leaf-globs for facets that are
    // currently inactive per overlay.effective.
    const leafGlobs: string[] = [];
    try {
      if (overlay && overlay.enabled && overlay.effective) {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const metaAbs = join(
          runCwd,
          config.stanPath,
          'system',
          'facet.meta.json',
        );
        const raw = await readFile(metaAbs, 'utf8');
        const meta = JSON.parse(raw) as Record<
          string,
          { exclude?: string[] } | undefined
        >;
        const isSubtree = (p: string): boolean => {
          const t = p.trim();
          return t.endsWith('/**') || t.endsWith('/*');
        };
        for (const [name, def] of Object.entries(meta ?? {})) {
          if (!def || !Array.isArray(def.exclude)) continue;
          if (!overlay.effective[name]) {
            for (const patt of def.exclude) {
              if (!isSubtree(patt)) leafGlobs.push(patt.replace(/\\+/g, '/'));
            }
          }
        }
      }
    } catch {
      /* best-effort only */
    }
    const engineExcludes = Array.from(
      new Set<string>([...overlayExcludes, ...leafGlobs]),
    );

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
      excludes: [...(config.excludes ?? []), ...engineExcludes],
      imports: config.imports,
      ...(overlay?.anchorsOverlay?.length
        ? { anchors: overlay.anchorsOverlay }
        : {}),
      overlayPlan: (() => {
        if (!overlay) return undefined;
        const lines: string[] = [];
        lines.push(`overlay: ${overlay.enabled ? 'on' : 'off'}`);
        if (overlay.enabled) {
          const inactive = Object.entries(overlay.effective)
            .filter(([, v]) => !v)
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
