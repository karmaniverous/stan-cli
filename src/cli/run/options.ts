import { Command, Option } from 'commander';

import { peekAndMaybeDebugLegacySync } from '@/cli/config/peek';
import { renderAvailableScriptsHelp } from '@/runner/help';
import { DBG_SCOPE_RUN_ENGINE_LEGACY } from '@/runner/util/debug-scopes';

import { applyCliSafety, runDefaults, tagDefault } from '../cli-utils';

export type FlagPresence = {
  sawNoScriptsFlag: boolean;
  sawScriptsFlag: boolean;
  sawExceptFlag: boolean;
};
/**
 * Register the `run` subcommand options and default tagging.
 * Returns the configured subcommand and a getter for raw flag presence.
 */
export const registerRunOptions = (
  cli: Command,
): {
  cmd: Command;
  getFlagPresence: () => FlagPresence;
} => {
  const cmd = cli
    .command('run')
    .description(
      'Run configured scripts to produce text outputs and archives (full + diff).',
    );

  // Selection flags
  const optScripts = new Option(
    '-s, --scripts [keys...]',
    'script keys to run (all scripts if omitted)',
  );
  const optNoScripts = new Option('-S, --no-scripts', 'do not run scripts');
  const optExcept = new Option(
    '-x, --except-scripts <keys...>',
    'script keys to exclude (reduces from --scripts or from full set)',
  );

  // Live TTY progress and hang thresholds
  const optLive = new Option(
    '-l, --live',
    'enable live progress table (TTY only)',
  );
  const optNoLive = new Option(
    '-L, --no-live',
    'disable live progress table (TTY only)',
  );
  const parsePositiveInt = (v: string): number => {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('seconds must be a positive integer');
    }
    return n;
  };
  const optHangWarn = new Option(
    '--hang-warn <seconds>',
    'label “stalled” after N seconds of inactivity (TTY only)',
  ).argParser(parsePositiveInt);
  const optHangKill = new Option(
    '--hang-kill <seconds>',
    'terminate stalled scripts after N seconds (SIGTERM→grace→SIGKILL; TTY only)',
  ).argParser(parsePositiveInt);
  const optHangKillGrace = new Option(
    '--hang-kill-grace <seconds>',
    'grace period in seconds before SIGKILL after SIGTERM (TTY only)',
  ).argParser(parsePositiveInt);

  // Mode flags
  const optSequential = new Option(
    '-q, --sequential',
    'run sequentially (with -s uses listed order; otherwise config order)',
  );
  const optNoSequential = new Option(
    '-Q, --no-sequential',
    'run concurrently (negated form)',
  );

  // Archive/outputs
  const optArchive = new Option(
    '-a, --archive',
    'create archive.tar and archive.diff.tar',
  );
  const optNoArchive = new Option('-A, --no-archive', 'do not create archives');
  const optCombine = new Option(
    '-c, --combine',
    'include script outputs inside archives and do not keep them on disk',
  )
    .implies({ archive: true })
    .conflicts(['keep']);
  const optNoCombine = new Option(
    '-C, --no-combine',
    'do not include outputs inside archives',
  );
  // Parse-time conflict: -c conflicts with -A (combine implies archives).
  optCombine.conflicts('archive');
  optNoArchive.conflicts('combine');

  // Output dir
  const optKeep = new Option(
    '-k, --keep',
    'keep (do not clear) the output directory',
  );
  const optNoKeep = new Option(
    '-K, --no-keep',
    'do not keep the output directory (negated form)',
  );

  // Plan
  const optPlan = new Option(
    '-p, --plan',
    'print run plan and exit (no side effects)',
  );
  // No-plan: execute without printing a plan first.
  // Placed immediately after -p per UX requirement.
  const optNoPlan = new Option(
    '-P, --no-plan',
    'do not print a run plan before execution',
  );

  // System prompt source
  const optPrompt = new Option(
    '-m, --prompt <value>',
    'system prompt source (auto|local|core|<path>)',
  );
  optPrompt.default('auto');

  // Register options in desired order
  cmd // selection first; -S directly after -s
    .addOption(optScripts)
    .addOption(optNoScripts)
    .addOption(optExcept)
    // mode
    .addOption(optSequential)
    .addOption(optNoSequential)
    // archives & outputs
    .addOption(optArchive)
    .addOption(optNoArchive)
    .addOption(optCombine)
    .addOption(optNoCombine)
    .addOption(optKeep)
    .addOption(optNoKeep)
    // plan
    .addOption(optPlan)
    .addOption(optNoPlan)
    .addOption(optPrompt)
    // live & thresholds
    .addOption(optLive)
    .addOption(optNoLive)
    .addOption(optHangWarn)
    .addOption(optHangKill)
    .addOption(optHangKillGrace);

  // Track raw presence of selection flags during parse to enforce -S vs -s/-x conflicts.
  let sawNoScriptsFlag = false;
  let sawScriptsFlag = false;
  let sawExceptFlag = false;
  cmd.on('option:no-scripts', () => {
    sawNoScriptsFlag = true;
  });
  cmd.on('option:scripts', () => {
    sawScriptsFlag = true;
  });
  cmd.on('option:except-scripts', () => {
    sawExceptFlag = true;
  });

  applyCliSafety(cmd);

  // Early legacy engine-config notice (preAction, STAN_DEBUG=1):
  // Emit once per invocation if the config file lacks top-level "stan-core".
  cmd.hook('preAction', () => {
    peekAndMaybeDebugLegacySync(DBG_SCOPE_RUN_ENGINE_LEGACY, process.cwd());
  });

  // Effective defaults from config (cliDefaults.run) over baseline
  const eff = runDefaults(process.cwd());

  // Tag defaulted boolean choices with (default)
  tagDefault(eff.archive ? optArchive : optNoArchive, true);
  tagDefault(eff.combine ? optCombine : optNoCombine, true);
  tagDefault(eff.keep ? optKeep : optNoKeep, true);
  tagDefault(eff.sequential ? optSequential : optNoSequential, true);
  tagDefault(eff.live ? optLive : optNoLive, true);

  // Show configured default for prompt (Commander will render "(default: value)")
  optPrompt.default(eff.prompt);

  // Apply Commander defaults for numeric thresholds so help shows (default: N)
  optHangWarn.default(eff.hangWarn);
  optHangKill.default(eff.hangKill);
  optHangKillGrace.default(eff.hangKillGrace);

  // Facet overlay (renamed)
  // -f, --facets [names...]     → overlay ON; activate specific facets; naked -f = all facets active
  // -F, --no-facets [names...]  → overlay ON; deactivate specific facets; naked -F = overlay OFF
  const optFacets = new Option(
    '-f, --facets [names...]',
    'activate specific facets for this run (naked form treats all facets active)',
  );
  const optNoFacets = new Option(
    '-F, --no-facets [names...]',
    'deactivate facets for this run (naked form disables overlay)',
  );
  // Tag default overlay state from cliDefaults.run.facets
  tagDefault(eff.facets ? optFacets : optNoFacets, true);

  cmd.addOption(optFacets).addOption(optNoFacets);

  // Overlay event presence (action resolves behavior)
  cmd.on('option:facets', () => void 0);
  cmd.on('option:no-facets', () => void 0);

  // Help footer
  cmd.addHelpText('after', () => renderAvailableScriptsHelp(process.cwd()));

  return {
    cmd,
    getFlagPresence: () => ({
      sawNoScriptsFlag,
      sawScriptsFlag,
      sawExceptFlag,
    }),
  };
};
