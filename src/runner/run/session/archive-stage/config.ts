// src/runner/run/session/archive-stage/config.ts
import type { RunnerConfig } from '@/runner/run/types';

/** Build FULL and DIFF base configs; DIFF honors anchors (changed-only via snapshot). */
export const makeBaseConfigs = (
  config: RunnerConfig,
): {
  full: {
    stanPath: string;
    includes?: string[];
    excludes?: string[];
    imports?: Record<string, string[]>;
  };
  diff: {
    stanPath: string;
    includes?: string[];
    excludes?: string[];
    imports?: Record<string, string[]>;
  };
} => {
  const full = {
    stanPath: config.stanPath,
    includes: config.includes ?? [],
    excludes: config.excludes ?? [],
    imports: config.imports,
    anchors: config.anchors ?? [],
  };
  const diff = {
    stanPath: config.stanPath,
    includes: config.includes ?? [],
    excludes: config.excludes ?? [],
    imports: config.imports,
    anchors: config.anchors ?? [],
  };
  return { full, diff };
};
