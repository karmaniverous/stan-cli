/* src/stan/snap/context.ts
 * Resolve execution context for snap commands (cwd, stanPath, maxUndos).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { findConfigPathSync, loadConfig } from '@karmaniverous/stan-core';
import YAML from 'yaml';

import { loadCliConfig } from '@/cli/config/load';
import { debugFallback } from '@/stan/util/debug';

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
    // Transitional: try to read stanPath/maxUndos from legacy root keys if namespaced missing
    const p = findConfigPathSync(cwd);
    if (p) {
      try {
        const raw = await readFile(p, 'utf8');
        const rootUnknown: unknown = p.endsWith('.json')
          ? (JSON.parse(raw) as unknown)
          : (YAML.parse(raw) as unknown);
        const obj =
          rootUnknown && typeof rootUnknown === 'object'
            ? (rootUnknown as Record<string, unknown>)
            : {};
        const stanCore =
          obj['stan-core'] && typeof obj['stan-core'] === 'object'
            ? (obj['stan-core'] as Record<string, unknown>)
            : null;
        const stanCli =
          obj['stan-cli'] && typeof obj['stan-cli'] === 'object'
            ? (obj['stan-cli'] as Record<string, unknown>)
            : null;

        const stanPath =
          stanCore &&
          typeof stanCore['stanPath'] === 'string' &&
          stanCore['stanPath'].trim().length
            ? stanCore['stanPath']
            : typeof obj['stanPath'] === 'string' &&
                obj['stanPath'].trim().length
              ? obj['stanPath']
              : '.stan';

        const maxUndos =
          stanCli && typeof stanCli['maxUndos'] === 'number'
            ? stanCli['maxUndos']
            : typeof obj['maxUndos'] === 'number'
              ? obj['maxUndos']
              : 10;

        cfg = { stanPath, maxUndos };
        debugFallback(
          'snap.context:legacy',
          `using legacy root keys from ${p.replace(/\\/g, '/')} (stanPath/maxUndos)`,
        );
      } catch {
        cfg = { stanPath: '.stan', maxUndos: 10 };
      }
    } else {
      cfg = { stanPath: '.stan', maxUndos: 10 };
    }
  }
  return { cwd, stanPath: cfg.stanPath, maxUndos: cfg.maxUndos ?? 10 };
};
