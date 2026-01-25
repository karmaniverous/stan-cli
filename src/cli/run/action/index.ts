import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import {
  buildDependencyMeta,
  createMetaArchive,
  ensureOutputDir,
  findConfigPathSync,
  resolveStanPathSync,
  stageDependencyContext,
  writeDependencyMapFile,
  writeDependencyMetaFile,
} from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import ts from 'typescript';

import { loadCliConfigSync } from '@/cli/config/load';
import { peekAndMaybeDebugLegacy } from '@/cli/config/peek';
import { pickCliNode, readRawConfigSync } from '@/cli/config/raw';
import { deriveRunParameters } from '@/cli/run/derive';
import { getRunDefaults } from '@/cli/run/derive/run-defaults';
import { resolveEffectiveEngineConfig } from '@/runner/config/effective';
import { runSelected } from '@/runner/run';
import { renderRunPlan } from '@/runner/run/plan';
import type { DependencyContext, RunnerConfig } from '@/runner/run/types';
import { DBG_SCOPE_RUN_ENGINE_LEGACY } from '@/runner/util/debug-scopes';

import type { FlagPresence } from '../options';
import { assertNoScriptsConflict } from './conflict';
import { runLoopHeaderAndGuard } from './loop';
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
    const cliCfg: {
      scripts?: Record<string, unknown>;
      cliDefaults?: Record<string, unknown>;
    } = (() => {
      try {
        return loadCliConfigSync(runCwd);
      } catch {
        try {
          const root = readRawConfigSync(runCwd);
          return (pickCliNode(root) ?? root) as {
            scripts?: Record<string, unknown>;
            cliDefaults?: Record<string, unknown>;
          };
        } catch {
          return {};
        }
      }
    })();

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

    // Pre-clean output dir (so we can write meta archive safely without it being wiped by the runner)
    await ensureOutputDir(runCwd, config.stanPath, derived.behavior.keep);

    // Context Mode (dependency graph)
    let dependency: DependencyContext | undefined;
    if (derived.behavior.context) {
      console.log('stan: building dependency graph...');
      const built = await buildDependencyMeta({
        cwd: runCwd,
        stanPath: config.stanPath,
        selection: {
          includes: config.includes ?? [],
          excludes: config.excludes ?? [],
        },
        typescript: ts,
      });
      await writeDependencyMetaFile({
        cwd: runCwd,
        stanPath: config.stanPath,
        meta: built.meta,
      });
      await writeDependencyMapFile({
        cwd: runCwd,
        stanPath: config.stanPath,
        map: built.map,
      });
      await stageDependencyContext({
        cwd: runCwd,
        stanPath: config.stanPath,
        map: built.map,
        clean: true,
      });
      const metaArch = await createMetaArchive(runCwd, config.stanPath);
      console.log(
        `stan: created meta archive ${path.relative(runCwd, metaArch).replace(/\\/g, '/')}`,
      );

      // "meta archive always created when context is in effect"
      // Pass dependency info to runner so it can do "WithDependencyContext" archives.
      dependency = {
        meta: built.meta,
        map: built.map,
        state: undefined,
        clean: false,
      };
    }

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
      dependency,
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
      // We already handled output clearing/retention via the explicit ensureOutputDir call above.
      // Pass keep: true to prevent the runner from clearing the directory again (which would delete the meta archive).
      { ...derived.behavior, keep: true },
      derived.promptChoice,
    );
  });
};
