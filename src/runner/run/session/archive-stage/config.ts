// src/runner/run/session/archive-stage/config.ts
import type { DependencyContext, RunnerConfig } from '@/runner/run/types';
import type { RunBehavior } from '@/runner/run/types';

/** Build FULL and DIFF base configs; DIFF honors anchors (changed-only via snapshot). */
export const makeBaseConfigs = (
  config: RunnerConfig,
  behavior: RunBehavior,
): {
  full: {
    stanPath: string;
    includes?: string[];
    excludes?: string[];
    imports?: Record<string, string[]>;
    meta?: boolean;
    dependency?: DependencyContext;
  };
  diff: {
    stanPath: string;
    includes?: string[];
    excludes?: string[];
    imports?: Record<string, string[]>;
    dependency?: DependencyContext;
  };
} => {
  const posix = (p: string) => p.replace(/\\/g, '/');
  const depFiles = [
    posix(`${config.stanPath}/context/dependency.meta.json`),
    posix(`${config.stanPath}/context/dependency.state.json`),
  ];

  // Standard run (no context): explicitly exclude dependency artifacts to meet "NOT contain" requirement.
  const forcedExcludes = !behavior.context ? depFiles : [];

  // Context run (meta or diff): explicitly include meta/state files so they
  // appear in archives (diffs) even if gitignored.
  const forcedIncludes = behavior.context
    ? [
        posix(`${config.stanPath}/context/dependency.meta.json`),
        posix(`${config.stanPath}/context/dependency.state.json`),
      ]
    : [];

  const full = {
    stanPath: config.stanPath,
    includes: [...(config.includes ?? []), ...forcedIncludes],
    excludes: [...(config.excludes ?? []), ...forcedExcludes],
    imports: config.imports,
    meta: behavior.meta,
    dependency: config.dependency,
  };
  const diff = {
    stanPath: config.stanPath,
    includes: [...(config.includes ?? []), ...forcedIncludes],
    excludes: [...(config.excludes ?? []), ...forcedExcludes],
    imports: config.imports,
    dependency: config.dependency,
  };
  return { full, diff };
};
