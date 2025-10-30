import type { Command } from 'commander';

import { getOptionSource, toStringArray } from '@/cli/run/action/util';
import { getRunDefaults } from '@/cli/run/derive/run-defaults';

import { type BuildOverlayInputsFn, loadBuildOverlayInputs } from './loaders';

export const resolveOverlayForRun = async (args: {
  cwd: string;
  stanPath: string;
  cmd: Command;
  options: Record<string, unknown>;
}): Promise<{
  overlayInputs: Awaited<ReturnType<BuildOverlayInputsFn>>;
  overlayEnabled: boolean;
  activateNames: string[];
  deactivateNames: string[];
}> => {
  const { cwd, stanPath, cmd, options } = args;
  const eff = getRunDefaults(cwd);

  // Parse per-run facet flags
  const getSrc = (name: string): string | undefined =>
    getOptionSource(cmd, name);
  const facetsOpt = (options as { facets?: unknown }).facets;
  const noFacetsOpt = (options as { noFacets?: unknown }).noFacets;

  const activateNames = toStringArray(facetsOpt);
  const deactivateNames = toStringArray(noFacetsOpt);

  const facetsProvided = getSrc('facets') === 'cli';
  const noFacetsProvided = getSrc('noFacets') === 'cli';
  const nakedActivateAll = facetsProvided && activateNames.length === 0;

  // Determine overlay enablement: defaults or per-run overrides
  let overlayEnabled = eff.facets;
  if (facetsProvided) overlayEnabled = true;
  if (noFacetsProvided)
    overlayEnabled = deactivateNames.length === 0 ? false : true;

  // Resolve builder at action-time (SSR-robust)
  const buildOverlayInputs = await loadBuildOverlayInputs();

  const overlayInputs = await buildOverlayInputs({
    cwd,
    stanPath,
    enabled: overlayEnabled,
    activateNames,
    deactivateNames,
    nakedActivateAll,
  });

  return {
    overlayInputs,
    overlayEnabled,
    activateNames,
    deactivateNames,
  };
};
