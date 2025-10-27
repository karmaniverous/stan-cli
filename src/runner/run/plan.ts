// src/stan/run/plan.ts
import path from 'node:path';

import type { RunnerConfig } from '@/runner/run/types';
import { bold as styleBold, isBoring } from '@/runner/util/color';

import type { ExecutionMode, RunBehavior, Selection } from './types';

/**
 * Render a readable, multi‑line summary of the run plan (pure).
 *
 * @param cwd - Repo root used only for `stanPath` path rendering.
 * @param args - Object with:
 *   - selection: Explicit selection (may be `null` to indicate “all”).
 *   - config: Resolved configuration.
 *   - mode: Execution mode (`concurrent` or `sequential`).
 *   - behavior: Archive/combine/keep flags.
 * @returns A human‑friendly summary printed by the CLI.
 */
export const renderRunPlan = (
  cwd: string,
  args: {
    selection: Selection;
    config: RunnerConfig;
    mode: ExecutionMode;
    behavior: RunBehavior;
  },
): string => {
  const { selection, config, mode, behavior } = args;

  const keys = selection == null ? Object.keys(config.scripts) : selection;
  const scripts = keys ?? [];

  const outputRel = path.join(config.stanPath, 'output').replace(/\\/g, '/');

  // Avoid calling style functions under SSR/BORING; render plain header when not styled
  const header = isBoring() ? 'STAN run plan' : styleBold('STAN run plan');

  const lines = [
    header,
    `mode: ${mode === 'sequential' ? 'sequential' : 'concurrent'}`,
    `output: ${outputRel}/`,
    ...(typeof behavior.prompt === 'string' && behavior.prompt.trim().length
      ? [`prompt: ${behavior.prompt}`]
      : []),
    `scripts: ${scripts.length ? scripts.join(', ') : 'none'}`,
    `archive: ${behavior.archive ? 'yes' : 'no'}`,
    `combine: ${behavior.combine ? 'yes' : 'no'}`,
    `keep output dir: ${behavior.keep ? 'yes' : 'no'}`,
    `live: ${behavior.live ? 'yes' : 'no'}`,
    `hang warn: ${typeof behavior.hangWarn === 'number' ? behavior.hangWarn.toString() : 'n/a'}s`,
    `hang kill: ${typeof behavior.hangKill === 'number' ? behavior.hangKill.toString() : 'n/a'}s`,
    `hang kill grace: ${
      typeof behavior.hangKillGrace === 'number'
        ? behavior.hangKillGrace.toString()
        : 'n/a'
    }s`,
    // Optional Facet view (supplied by action via RunnerConfig.overlayPlan)
    ...(Array.isArray(config.overlayPlan) && config.overlayPlan.length
      ? ['facet view:', ...config.overlayPlan.map((l) => `  ${l}`)]
      : []),
  ];
  return `stan:\n  ${lines.join('\n  ')}`;
};
