/// src/cli/stan/run/action.ts
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

import { loadCliConfigSync } from '@/cli/config/load';
import { confirmLoopReversal } from '@/stan/loop/reversal';
import { isBackward, readLoopState, writeLoopState } from '@/stan/loop/state';
import { runSelected } from '@/stan/run';
import { renderRunPlan } from '@/stan/run/plan';
import { go } from '@/stan/util/color';
import { debugFallback } from '@/stan/util/debug';

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
      getFlagPresence(); // Authoritative conflict handling: -S cannot be combined with -s/-x
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

    // Load repo config as ContextConfig; on failure, fall back to sane minimal defaults.
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
      // Resolve stanPath via core helper; if that also fails, use DEFAULT_STAN_PATH (".stan").
      let stanPathFallback = DEFAULT_STAN_PATH;
      try {
        stanPathFallback = resolveStanPathSync(runCwd);
      } catch {
        debugFallback(
          'run.action:stanPath',
          'resolveStanPathSync failed; using DEFAULT_STAN_PATH',
        );
      }
      // NOTE: scripts are CLI concern; legacy placeholder remains empty here.
      // Cast is intentional until CLI config loader is wired.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config = { stanPath: stanPathFallback, scripts: {} } as any;
    }

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
    const derived = deriveRunParameters({ options, cmd, config });

    const planBody = renderRunPlan(runCwd, {
      selection: derived.selection,
      config,
      mode: derived.mode,
      behavior: derived.behavior,
    });

    // Resolve plan semantics:
    // -p/--plan => print the plan and exit (plan-only)
    // -P/--no-plan => execute without printing plan first
    // Otherwise: default from cliDefaults.run.plan (fallback true)
    const planOpt = (options as { plan?: unknown }).plan;
    const noPlanFlag = Boolean((options as { noPlan?: unknown }).noPlan);

    // Default print-plan behavior from config
    let defaultPrintPlan = true;
    try {
      const cliCfg = loadCliConfigSync(runCwd);
      const planMaybe = cliCfg.cliDefaults?.run?.plan;
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

    // Determine whether to print the plan header before execution.
    // CLI flags override config defaults:
    // -P/--no-plan or --plan=false => suppress
    // otherwise: use cliDefaults.run.plan (default true)
    let printPlan = defaultPrintPlan;
    if (noPlanFlag || planOpt === false) {
      printPlan = false;
    }
    (derived.behavior as { plan?: boolean }).plan = printPlan;

    await runSelected(
      runCwd,
      config,
      derived.selection,
      derived.mode,
      derived.behavior,
    );
  });
};
