/* src/stan/snap/context.ts
 * Resolve execution context for snap commands (cwd, stanPath, maxUndos).
 */
import path from 'node:path';

import { findConfigPathSync, loadConfig } from '@karmaniverous/stan-core';

import { loadCliConfig } from '@/cli/config/load';

/**
 * Resolve the effective execution context for snapshot operations. *
 * Starting from `cwd0`, locates the nearest `stan.config.*` and returns:
 * - `cwd`: the directory containing that config (or `cwd0` if none found),
 * - `stanPath`: configured workspace folder (defaults to ".stan"),
 * - `maxUndos`: normalized retention for snapshot history (default 10).
 *
 * @param cwd0 - Directory to start searching from.
 * @returns Resolved `{ cwd, stanPath, maxUndos }`.
 */
export const resolveContext = async (
  cwd0: string,
): Promise<{ cwd: string; stanPath: string; maxUndos: number }> => {
  const cfgPath = findConfigPathSync(cwd0);
  const cwd = cfgPath ? path.dirname(cfgPath) : cwd0;
  let cfg: { stanPath: string; maxUndos?: number };
  try {
    const [engine, cli] = await Promise.all([
      loadConfig(cwd),
      loadCliConfig(cwd),
    ]);
    cfg = {
      stanPath: engine.stanPath,
      maxUndos: cli.maxUndos,
    };
  } catch {
    cfg = { stanPath: '.stan', maxUndos: 10 };
  }
  return { cwd, stanPath: cfg.stanPath, maxUndos: cfg.maxUndos ?? 10 };
};
