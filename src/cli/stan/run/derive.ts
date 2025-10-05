import type { ContextConfig } from '@karmaniverous/stan-core';
import type { Command } from 'commander';

import type { ExecutionMode, RunBehavior } from '@/stan/run';

import { deriveRunInvocation } from '../run-args';
import { RUN_BASE_DEFAULTS } from './defaults';
export type DerivedRun = {
  selection: string[];
  mode: ExecutionMode;
  behavior: RunBehavior;
};
/**
 * Derive selection/mode/behavior given parsed options, the configured defaults,
 * and Commander option sources.
 */
export const deriveRunParameters = (args: {
  options: Record<string, unknown>;
  cmd: Command;
  config: ContextConfig;
}): DerivedRun => {
  const { options, config } = args;
  const src = args.cmd as unknown as {
    getOptionValueSource?: (name: string) => string | undefined;
  };

  const scriptsOpt = (options as { scripts?: unknown }).scripts;
  const exceptOpt = (options as { exceptScripts?: unknown }).exceptScripts;
  const scriptsProvided =
    Array.isArray(scriptsOpt) || typeof scriptsOpt === 'string';
  const exceptProvided =
    Array.isArray(exceptOpt) && (exceptOpt as unknown[]).length > 0;

  const valSrc = (name: string) => src.getOptionValueSource?.(name) === 'cli';
  const cfgRun = (config.cliDefaults ?? {}).run ?? {};
  const boolFinal = (
    name: 'archive' | 'combine' | 'keep' | 'sequential' | 'live',
    base: boolean,
  ): boolean => {
    if (valSrc(name)) return Boolean(options[name]);
    if (typeof (cfgRun as Record<string, unknown>)[name] === 'boolean')
      return Boolean((cfgRun as Record<string, unknown>)[name]);
    return base;
  };
  const numFinal = (
    name: 'hangWarn' | 'hangKill' | 'hangKillGrace',
    base: number,
  ): number => {
    if (valSrc(name)) {
      const raw = options[name];
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : base;
    }
    const fromCfg = (cfgRun as Record<string, unknown>)[name];
    if (typeof fromCfg === 'number' && fromCfg > 0) return fromCfg;
    return base;
  };

  // Booleans (from CLI when provided; else config; else baseline)
  const combine = boolFinal('combine', RUN_BASE_DEFAULTS.combine);
  const keep = boolFinal('keep', RUN_BASE_DEFAULTS.keep);
  const sequential = boolFinal('sequential', RUN_BASE_DEFAULTS.sequential);
  const live = boolFinal('live', RUN_BASE_DEFAULTS.live);
  let archive = boolFinal('archive', RUN_BASE_DEFAULTS.archive);
  // Explicit -A from CLI always wins
  if (valSrc('archive') && (options as { archive?: boolean }).archive === false)
    archive = false;
  // combine implies archive
  if (combine) archive = true;

  // Numerics
  const hangWarnFinal = numFinal('hangWarn', RUN_BASE_DEFAULTS.hangWarn);
  const hangKillFinal = numFinal('hangKill', RUN_BASE_DEFAULTS.hangKill);
  const hangKillGraceFinal = numFinal(
    'hangKillGrace',
    RUN_BASE_DEFAULTS.hangKillGrace,
  );

  const derivedBase = deriveRunInvocation({
    scriptsProvided,
    scriptsOpt,
    exceptProvided,
    exceptOpt,
    sequential,
    combine,
    keep,
    archive,
    config,
  });

  const noScripts = (options as { scripts?: unknown }).scripts === false;
  const allKeys = Object.keys(config.scripts);
  let selection: string[] = [];
  if (noScripts) {
    selection = [];
  } else if (scriptsProvided) {
    selection = derivedBase.selection;
  } else {
    const sdef = (
      (config.cliDefaults ?? {}) as { run?: { scripts?: boolean | string[] } }
    ).run?.scripts;
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
  return { selection, mode, behavior };
};
