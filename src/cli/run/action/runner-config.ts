import type { ContextConfig } from '@karmaniverous/stan-core';

import type { RunnerConfig } from '@/runner/run/types';

/** Compose the RunnerConfig from engine config, scripts, and overlay inputs. */
export const makeRunnerConfig = (args: {
  config: ContextConfig;
  scriptsMap: Record<string, string>;
  engineExcludes: string[];
  anchors?: string[];
  overlayPlan?: string[];
}): RunnerConfig => {
  const { config, scriptsMap, engineExcludes, anchors, overlayPlan } = args;
  return {
    stanPath: config.stanPath,
    scripts: scriptsMap,
    includes: config.includes ?? [],
    excludes: [...(config.excludes ?? []), ...engineExcludes],
    imports: config.imports,
    ...(Array.isArray(anchors) && anchors.length ? { anchors } : {}),
    overlayPlan,
  };
};
