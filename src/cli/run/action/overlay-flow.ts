import type { Command } from 'commander';

import { getOptionSource, toStringArray } from '@/cli/cli-utils';
import { getRunDefaults } from '@/cli/run/derive/run-defaults';
import type { FacetOverlayOutput } from '@/runner/overlay/facets';

import { buildOverlayInputs } from './overlay';

export type ResolvedOverlayForRun = {
  overlayInputs: {
    overlay: FacetOverlayOutput | null;
    engineExcludes: string[];
    overlayPlan?: string[];
  };
  overlayEnabled: boolean;
  activateNames: string[];
  deactivateNames: string[];
};

export const resolveOverlayForRun = async (args: {
  cwd: string;
  stanPath: string;
  cmd: Command;
  options: Record<string, unknown>;
}): Promise<ResolvedOverlayForRun> => {
  const { cwd, stanPath, cmd, options } = args;
  const eff = getRunDefaults(cwd);

  // Parse per-run facet flags (Commander sources are required to disambiguate defaults vs CLI intent).
  const getSrc = (name: string): string | undefined =>
    getOptionSource(cmd, name);

  // Boolean overlay enablement flag (Commander negation stores this on "facets"):
  //   --facets    => options.facets === true  (source=cli)
  //   --no-facets => options.facets === false (source=cli)
  const facetsFlag = (options as { facets?: unknown }).facets;
  const facetsFlagProvided = getSrc('facets') === 'cli';

  // Per-run overrides (do not persist to facet.state.json).
  const facetsOnOpt = (options as { facetsOn?: unknown }).facetsOn;
  const facetsOffOpt = (options as { facetsOff?: unknown }).facetsOff;
  const activateNames = toStringArray(facetsOnOpt);
  const deactivateNames = toStringArray(facetsOffOpt);
  const facetsOnProvided = getSrc('facetsOn') === 'cli';
  const facetsOffProvided = getSrc('facetsOff') === 'cli';

  // Determine overlay enablement: defaults or per-run overrides
  let overlayEnabled = eff.facets;
  if (facetsFlagProvided) {
    // Explicit --facets/--no-facets wins (Commander negation shape).
    overlayEnabled = Boolean(facetsFlag);
  } else if (facetsOnProvided || facetsOffProvided) {
    // Per-run overrides imply overlay ON (unless user explicitly disables via --no-facets, which conflicts).
    overlayEnabled = true;
  }

  const overlayInputs = await buildOverlayInputs({
    cwd,
    stanPath,
    enabled: overlayEnabled,
    activateNames,
    deactivateNames,
    nakedActivateAll: false,
  });

  return {
    overlayInputs,
    overlayEnabled,
    activateNames,
    deactivateNames,
  };
};
