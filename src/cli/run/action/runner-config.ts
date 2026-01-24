import type { ContextConfig } from '@karmaniverous/stan-core';

import type { DependencyContext, RunnerConfig } from '@/runner/run/types';

/** Compose the RunnerConfig from engine config and CLI inputs. */
export const makeRunnerConfig = (args: {
  config: ContextConfig;
  scriptsMap: Record<string, string>;
  dependency?: DependencyContext;
}): RunnerConfig => {
  const { config, scriptsMap, dependency } = args;
  return {
    stanPath: config.stanPath,
    scripts: scriptsMap,
    includes: config.includes ?? [],
    excludes: config.excludes ?? [],
    imports: config.imports,
    dependency,
  };
};
