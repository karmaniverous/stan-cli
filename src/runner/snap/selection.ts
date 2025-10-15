// src/stan/snap/selection.ts
// Helper to read selection context (stanPath, includes, excludes) from repo config.
import { loadConfig } from '@karmaniverous/stan-core';

export const readSelection = async (
  cwd: string,
): Promise<{ stanPath: string; includes: string[]; excludes: string[] }> => {
  try {
    const cfg = await loadConfig(cwd);
    return {
      stanPath: cfg.stanPath,
      includes: Array.isArray(cfg.includes) ? cfg.includes : [],
      excludes: Array.isArray(cfg.excludes) ? cfg.excludes : [],
    };
  } catch {
    // Best-effort fallback (aligns with transitional defaults elsewhere)
    return {
      stanPath: '.stan',
      includes: [],
      excludes: [],
    };
  }
};

export default readSelection;
