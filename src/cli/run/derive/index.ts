// src/cli/run/derive/index.ts
import type { Command } from 'commander';

import type { ExecutionMode, RunBehavior } from '@/runner/run';

import { deriveRunInvocation } from '../../run-args';
import { RUN_BASE_DEFAULTS } from '../defaults';
import { getRunDefaults } from './run-defaults';
import type { DerivedRun } from './types';

/**
 * Derive selection/mode/behavior given parsed options, the configured defaults,
 * and Commander option sources.
 */
export function deriveRunParameters(args: {
  options: Record<string, unknown>;
  cmd: Command;
  scripts: Record<string, unknown>;
  scriptsDefault?: boolean | string[];
  dir?: string;
}): DerivedRun {
  const { options, scripts, scriptsDefault } = args;
  const src = args.cmd as unknown as {
    getOptionValueSource?: (name: string) => string | undefined;
  };
  const root = (args.cmd.parent ?? args.cmd) as unknown as {
    getOptionValueSource?: (name: string) => string | undefined;
    opts?: () => { debug?: boolean };
  };

  const scriptsOpt = (options as { scripts?: unknown }).scripts;
  const exceptOpt = (options as { exceptScripts?: unknown }).exceptScripts;
  const scriptsProvided =
    Array.isArray(scriptsOpt) || typeof scriptsOpt === 'string';
  const exceptProvided =
    Array.isArray(exceptOpt) && (exceptOpt as unknown[]).length > 0;

  const eff = getRunDefaults(args.dir);
  // Avoid unsafe Record casts; pick exact subsets we need.
  const effBools = {
    archive: eff.archive,
    combine: eff.combine,
    keep: eff.keep,
    sequential: eff.sequential,
    live: eff.live,
  } as const;
  const effNums = {
    hangWarn: eff.hangWarn,
    hangKill: eff.hangKill,
    hangKillGrace: eff.hangKillGrace,
  } as const;

  const boolFinal = (name: keyof typeof effBools): boolean => {
    if (src.getOptionValueSource?.(name) === 'cli')
      return Boolean(options[name]);
    return effBools[name];
  };
  const numFinal = (name: keyof typeof effNums, base: number): number => {
    if (src.getOptionValueSource?.(name) === 'cli') {
      const raw = options[name];
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : base;
    }
    const fromEff = effNums[name];
    return typeof fromEff === 'number' && fromEff > 0 ? fromEff : base;
  };

  // Booleans (from CLI when provided; else config; else baseline)
  const combine = boolFinal('combine');
  const keep = boolFinal('keep');
  const sequential = boolFinal('sequential');
  let live = boolFinal('live');
  let archive = boolFinal('archive');
  // Explicit -A from CLI always wins
  if (
    src.getOptionValueSource?.('archive') === 'cli' &&
    (options as { archive?: boolean }).archive === false
  )
    archive = false;
  // Defaults coherence:
  // When the configured default selection is "no scripts" (scripts=false) and
  // the user did not provide an explicit archive flag on the CLI, prefer
  // archive=false so the run behaves as a plan-only by default.
  // This preserves “run semantics v2” expectations and matches
  // tests that set cliDefaults.run.scripts=false and archive=false.
  if (
    scriptsDefault === false &&
    src.getOptionValueSource?.('archive') !== 'cli'
  ) {
    archive = false;
  }
  // combine implies archive
  if (combine) archive = true;

  // Numerics
  const hangWarnFinal = numFinal('hangWarn', RUN_BASE_DEFAULTS.hangWarn);
  const hangKillFinal = numFinal('hangKill', RUN_BASE_DEFAULTS.hangKill);
  const hangKillGraceFinal = numFinal(
    'hangKillGrace',
    RUN_BASE_DEFAULTS.hangKillGrace,
  );
  // Prompt choice: CLI flag overrides cliDefaults; fallback to 'auto'
  const promptChoice =
    src.getOptionValueSource?.('prompt') === 'cli' &&
    typeof (options as { prompt?: unknown }).prompt === 'string'
      ? String((options as { prompt?: unknown }).prompt)
      : eff.prompt;

  // Option C: --debug forces --no-live (strict).
  // Warning when both --debug and --live were explicitly provided.
  const debugActive = process.env.STAN_DEBUG === '1';
  if (debugActive) {
    const liveFromCli = src.getOptionValueSource?.('live') === 'cli';
    const debugFromCli = root.getOptionValueSource?.('debug') === 'cli';
    const liveFlagVal =
      typeof (options as { live?: unknown }).live === 'boolean'
        ? Boolean((options as { live?: unknown }).live)
        : undefined;

    if (debugFromCli && liveFromCli && liveFlagVal === true) {
      // Force no-live and inform the user that --live is ignored.
      console.warn('stan: --debug forces --no-live; ignoring --live');
    }
    live = false;
  }

  const derivedBase = deriveRunInvocation({
    scriptsProvided,
    scriptsOpt,
    exceptProvided,
    exceptOpt,
    sequential,
    combine,
    keep,
    archive,
    config: { scripts },
  });

  const noScripts = (options as { scripts?: unknown }).scripts === false;
  const allKeys = Object.keys(scripts);
  let selection: string[] = [];
  if (noScripts) {
    selection = [];
  } else if (scriptsProvided) {
    selection = derivedBase.selection;
  } else {
    const sdef = scriptsDefault;
    let base: string[] = [];
    if (sdef === false) base = [];
    else if (sdef === true || typeof sdef === 'undefined') base = [...allKeys];
    else if (Array.isArray(sdef))
      base = allKeys.filter((k) => sdef.includes(k));
    const exceptList = Array.isArray(exceptOpt)
      ? (exceptOpt as string[]).filter((k) => typeof k === 'string')
      : [];
    if (exceptProvided && exceptList.length > 0) {
      const ex = new Set(exceptList);
      base = base.filter((k) => !ex.has(k));
    }
    selection = base;
  }

  const mode: ExecutionMode = sequential ? 'sequential' : 'concurrent';
  const behavior: RunBehavior = {
    combine,
    keep,
    archive,
    live,
    hangWarn: hangWarnFinal,
    hangKill: hangKillFinal,
    hangKillGrace: hangKillGraceFinal,
  };
  return {
    selection,
    mode,
    behavior,
    promptChoice,
  };
}

// SSR/mock‑friendly default export: delegate to the named function.
export default function deriveRunParametersDefault(args: {
  options: Record<string, unknown>;
  cmd: Command;
  scripts: Record<string, unknown>;
  scriptsDefault?: boolean | string[];
  dir?: string;
}): DerivedRun {
  // Defer to the canonical implementation to keep behavior centralized.
  // This default exists solely to satisfy loader fallbacks in SSR/mocks.
  return deriveRunParameters(args);
}
