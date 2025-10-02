/// src/cli/stan/run/action.ts
import path from 'node:path';

import type { ContextConfig } from '@karmaniverous/stan-core';
import { findConfigPathSync, loadConfig } from '@karmaniverous/stan-core';
import type { Command } from 'commander';
import { CommanderError } from 'commander';

import { runSelected } from '@/stan/run';
import { renderRunPlan } from '@/stan/run/plan';

import { deriveRunParameters } from './derive';
import type { FlagPresence } from './options';

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

    // Load repo config as ContextConfig; on failure, fall back to sane minimal defaults.
    let config: ContextConfig;
    try {
      config = await loadConfig(runCwd);
    } catch (err) {
      if (process.env.STAN_DEBUG === '1') {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : String(err);
        console.error('stan: failed to load config', msg);
      }
      config = { stanPath: 'stan', scripts: {} };
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
    const cfgRun = (
      (config.cliDefaults ?? {}) as {
        run?: { plan?: boolean };
      }
    ).run;
    const defaultPrintPlan =
      typeof cfgRun?.plan === 'boolean' ? cfgRun.plan : true;

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
