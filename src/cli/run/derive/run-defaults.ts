// src/cli/run/derive/run-defaults.ts
import { readFileSync } from 'node:fs';

import { findConfigPathSync } from '@karmaniverous/stan-core';

import { parseText } from '@/common/config/parse';

import * as cliUtils from '../../cli-utils';
import { RUN_BASE_DEFAULTS } from '../defaults';
import type { RunDefaultsShape } from './types';

/** Baseline run defaults (merged with cliDefaults.run). */
export const BASELINE: RunDefaultsShape = {
  ...RUN_BASE_DEFAULTS,
  plan: true,
  prompt: 'auto',
  context: false,
};

/** Minimal sync parser for cliDefaults.run from stan.config.* (namespaced first; legacy fallback). */
export const readRunDefaultsFromConfig = (dir?: string): RunDefaultsShape => {
  try {
    const p = findConfigPathSync(dir ?? process.cwd());
    if (!p) return BASELINE;
    const raw = readFileSync(p, 'utf8');
    const rootUnknown: unknown = parseText(p, raw);
    const root =
      rootUnknown && typeof rootUnknown === 'object'
        ? (rootUnknown as Record<string, unknown>)
        : {};
    const cliNs =
      root['stan-cli'] && typeof root['stan-cli'] === 'object'
        ? (root['stan-cli'] as Record<string, unknown>)
        : null;
    const def =
      (cliNs && typeof cliNs['cliDefaults'] === 'object'
        ? (cliNs['cliDefaults'] as Record<string, unknown>)
        : (root['cliDefaults'] as Record<string, unknown> | undefined)) ?? {};
    const run =
      typeof def['run'] === 'object'
        ? (def['run'] as Record<string, unknown>)
        : {};

    const toBool = (v: unknown): boolean | undefined => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v === 1;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === '1' || s === 'true'
          ? true
          : s === '0' || s === 'false'
            ? false
            : undefined;
      }
      return undefined;
    };
    const pickNum = (v: unknown, base: number) =>
      typeof v === 'number' && v > 0 ? v : base;
    const pickStr = (v: unknown, base: string) =>
      typeof v === 'string' && v.trim().length ? v.trim() : base;

    return {
      archive: toBool(run['archive']) ?? BASELINE.archive,
      combine: toBool(run['combine']) ?? BASELINE.combine,
      keep: toBool(run['keep']) ?? BASELINE.keep,
      sequential: toBool(run['sequential']) ?? BASELINE.sequential,
      live: toBool(run['live']) ?? BASELINE.live,
      plan: toBool(run['plan']) ?? BASELINE.plan,
      context: toBool(run['context']) ?? BASELINE.context,
      hangWarn: pickNum(run['hangWarn'], BASELINE.hangWarn),
      hangKill: pickNum(run['hangKill'], BASELINE.hangKill),
      hangKillGrace: pickNum(run['hangKillGrace'], BASELINE.hangKillGrace),
      prompt: pickStr(run['prompt'], BASELINE.prompt),
    };
  } catch {
    return BASELINE;
  }
};

/**
 * SSR‑robust run defaults resolver.
 * - Prefer cli-utils.runDefaults() when available (normal runtime).
 * - Fallback: parse stan.config.* synchronously (namespaced first; legacy root).
 */
export const getRunDefaults = (dir?: string): RunDefaultsShape => {
  try {
    const maybe = (cliUtils as unknown as { runDefaults?: unknown })
      .runDefaults;
    if (typeof maybe === 'function') {
      return (maybe as (d?: string) => RunDefaultsShape)(dir);
    }
  } catch {
    /* fall through to local parser */
  }
  return readRunDefaultsFromConfig(dir);
};
