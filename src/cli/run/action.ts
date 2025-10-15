/// src/cli/stan/run/action.ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { findConfigPathSync } from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import { CommanderError } from 'commander';
import YAML from 'yaml';

import { loadCliConfigSync } from '@/cli/config/load';
import { printHeader } from '@/cli/header';
import { resolveEffectiveEngineConfig } from '@/runner/config/effective';
import { confirmLoopReversal } from '@/runner/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/runner/loop/state';
import { runSelected } from '@/runner/run';
import { renderRunPlan } from '@/runner/run/plan';
import type { RunnerConfig } from '@/runner/run/types';
import { debugFallback } from '@/runner/util/debug';

import { deriveRunParameters } from './derive';
import type { FlagPresence } from './options';

export const registerRunAction = (
  cmd: Command,
  getFlagPresence: () => FlagPresence,
): void => {
  cmd.action(async (options: Record<string, unknown>) => {
    let legacyWarned = false;
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
    try {
      const pEarly = findConfigPathSync(runCwd);
      if (pEarly) {
        const rawEarly = await readFile(pEarly, 'utf8');
        const rootUnknownEarly: unknown = pEarly.endsWith('.json')
          ? (JSON.parse(rawEarly) as unknown)
          : (YAML.parse(rawEarly) as unknown);
        const rootEarly =
          rootUnknownEarly && typeof rootUnknownEarly === 'object'
            ? (rootUnknownEarly as Record<string, unknown>)
            : {};
        if (!Object.prototype.hasOwnProperty.call(rootEarly, 'stan-core')) {
          debugFallback(
            'run.action:engine-legacy',
            `detected legacy root keys (no "stan-core") in ${pEarly.replace(/\\/g, '/')}`,
          );
          legacyWarned = true;
        }
      }
    } catch {
      /* ignore */
    }
    const config: ContextConfig = await resolveEffectiveEngineConfig(
      runCwd,
      'run.action:engine-legacy',
    );

    // CLI defaults and scripts for runner config/derivation
    const cliCfg = loadCliConfigSync(runCwd);
    const runnerConfig: RunnerConfig = {
      stanPath: config.stanPath,
      scripts: cliCfg.scripts,
      // Propagate selection context for the archive phase (legacy-friendly).
      // These originate from the resolved engine ContextConfig above, which may
      // be synthesized from legacy root keys during the transitional window.
      includes: config.includes ?? [],
      excludes: config.excludes ?? [],
      imports: config.imports,
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
    const derived = deriveRunParameters({
      options,
      cmd,
      scripts: cliCfg.scripts,
      scriptsDefault: cliCfg.cliDefaults?.run?.scripts,
    });

    const planBody = renderRunPlan(runCwd, {
      selection: derived.selection,
      config: runnerConfig,
      mode: derived.mode,
      behavior: derived.behavior,
    });

    // Resolve plan semantics:
    const planOpt = (options as { plan?: unknown }).plan;
    const noPlanFlag = Boolean((options as { noPlan?: unknown }).noPlan);

    // Default print-plan behavior from config
    let defaultPrintPlan = true;
    try {
      const cliCfg2 = loadCliConfigSync(runCwd);
      const planMaybe = cliCfg2.cliDefaults?.run?.plan;
      defaultPrintPlan = typeof planMaybe === 'boolean' ? planMaybe : true;
    } catch {
      /* keep built-in true */
    }

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
