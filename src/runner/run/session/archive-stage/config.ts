// src/runner/run/session/archive-stage/config.ts
import type { RunnerConfig } from '@/runner/run/types';
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
  };
  diff: {
    stanPath: string;
    includes?: string[];
    excludes?: string[];
    imports?: Record<string, string[]>;
  };
} => {
  const posix = (p: string) => p.replace(/\\/g, '/');
  const depFiles = [
    posix(`${config.stanPath}/context/dependency.meta.json`),
    posix(`${config.stanPath}/context/dependency.state.json`),
  ];

  // Standard run (no context): explicitly exclude dependency artifacts to meet "NOT contain" requirement.
  const forcedExcludes = !behavior.context ? depFiles : [];

  // Meta run: explicitly include state file (user requirement: "SHOULD contain dependency.state.json").
  // Core's createMetaArchive excludes it by default (clean slate), so we force it back via includes.
  const forcedIncludes = behavior.meta
    ? [posix(`${config.stanPath}/context/dependency.state.json`)]
    : [];

  const full = {
    stanPath: config.stanPath,
    includes: [...(config.includes ?? []), ...forcedIncludes],
    excludes: [...(config.excludes ?? []), ...forcedExcludes],
    imports: config.imports,
    meta: behavior.meta,
  };
  const diff = {
    stanPath: config.stanPath,
    includes: [...(config.includes ?? []), ...forcedIncludes],
    excludes: [...(config.excludes ?? []), ...forcedExcludes],
    imports: config.imports,
  };
  return { full, diff };
};
