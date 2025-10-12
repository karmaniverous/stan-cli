/// src/cli/stan/run/action.ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import {
  DEFAULT_STAN_PATH,
  findConfigPathSync,
  loadConfig,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import { CommanderError } from 'commander';
import YAML from 'yaml';

import { loadCliConfigSync } from '@/cli/config/load';
import { confirmLoopReversal } from '@/stan/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/stan/loop/state';
import { runSelected } from '@/stan/run';
import { renderRunPlan } from '@/stan/run/plan';
import type { RunnerConfig } from '@/stan/run/types';
import { go } from '@/stan/util/color';

import { deriveRunParameters } from './derive';
import type { FlagPresence } from './options';

export const registerRunAction = (
  cmd: Command,
  getFlagPresence: () => FlagPresence,
): void => {
  const isTTY = Boolean(
    (process.stdout as unknown as { isTTY?: boolean })?.isTTY,
  );
  const isBoring = (): boolean =>
    process.env.STAN_BORING === '1' ||
    process.env.NO_COLOR === '1' ||
    process.env.FORCE_COLOR === '0' ||
    !isTTY;
  const header = (last: string | null): void => {
    const token = isBoring() ? 'run' : go('▶︎ run');
    console.log(`stan: ${token} (last command: ${last ?? 'none'})`);
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
    let config: ContextConfig;
    try {
      config = await loadConfig(runCwd);
    } catch (err) {
      // Debug-only notice: config load diversion from happy path
      {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : String(err);
        debugFallback('run.action:loadConfig', msg);
      }
      const p = findConfigPathSync(runCwd);
      if (p) {
        try {
          const raw = await readFile(p, 'utf8');
          const rootUnknown: unknown = p.endsWith('.json')
            ? (JSON.parse(raw) as unknown)
            : (YAML.parse(raw) as unknown);
          const obj =
            rootUnknown && typeof rootUnknown === 'object'
              ? (rootUnknown as Record<string, unknown>)
              : {};

          const stanCore =
            obj['stan-core'] && typeof obj['stan-core'] === 'object'
              ? (obj['stan-core'] as Record<string, unknown>)
              : null;

          if (!stanCore) {
            const stanPathRaw = obj['stanPath'];
            const includesRaw = obj['includes'];
            const excludesRaw = obj['excludes'];
            const importsRaw = obj['imports'];

            const stanPath =
              typeof stanPathRaw === 'string' && stanPathRaw.trim().length
                ? stanPathRaw
                : (() => {
                    try {
                      return resolveStanPathSync(runCwd);
                    } catch {
                      debugFallback(
                        'run.action:stanPath',
                        'resolveStanPathSync failed; using DEFAULT_STAN_PATH',
                      );
                      return DEFAULT_STAN_PATH;
                    }
                  })();

            const includes = Array.isArray(includesRaw)
              ? includesRaw.filter((s): s is string => typeof s === 'string')
              : [];
            const excludes = Array.isArray(excludesRaw)
              ? excludesRaw.filter((s): s is string => typeof s === 'string')
              : [];
            const imports =
              importsRaw && typeof importsRaw === 'object'
                ? (importsRaw as Record<string, string | string[]>)
                : undefined;

            config = { stanPath, includes, excludes, imports } as ContextConfig;
            debugFallback(
              'run.action:engine-legacy',
              `synthesized engine config from legacy root keys in ${p.replace(/\\/g, '/')}`,
            );
          } else {
            // Fallback (rare): use stan-core.stanPath if present; otherwise default
            const sp = stanCore['stanPath'];
            const stanPath =
              typeof sp === 'string' && sp.trim().length
                ? sp
                : (() => {
                    try {
                      return resolveStanPathSync(runCwd);
                    } catch {
                      debugFallback(
                        'run.action:stanPath',
                        'resolveStanPathSync failed; using DEFAULT_STAN_PATH',
                      );
                      return DEFAULT_STAN_PATH;
                    }
                  })();
            config = { stanPath } as ContextConfig;
          }
        } catch {
          // Ultimate fallback: stanPath only
          let stanPathFallback = DEFAULT_STAN_PATH;
          try {
            stanPathFallback = resolveStanPathSync(runCwd);
          } catch {
            debugFallback(
              'run.action:stanPath',
              'resolveStanPathSync failed; using DEFAULT_STAN_PATH',
            );
          }
          config = { stanPath: stanPathFallback } as ContextConfig;
        }
      } else {
        // No config file found — default stanPath
        let stanPathFallback = DEFAULT_STAN_PATH;
        try {
          stanPathFallback = resolveStanPathSync(runCwd);
        } catch {
          debugFallback(
            'run.action:stanPath',
            'resolveStanPathSync failed; using DEFAULT_STAN_PATH',
          );
        }
        config = { stanPath: stanPathFallback } as ContextConfig;
      }
    }

    // CLI defaults and scripts for runner config/derivation
    const cliCfg = loadCliConfigSync(runCwd);
    const runnerConfig: RunnerConfig = {
      stanPath: config.stanPath,
      scripts: cliCfg.scripts,
    };

    // Loop header + reversal guard
    try {
      const st = await readLoopState(runCwd, config.stanPath);
      header(st?.last ?? null);
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
    );
  });
};
