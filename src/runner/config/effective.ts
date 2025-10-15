// src/runner/config/effective.ts
// Resolve effective engine ContextConfig (stanPath, includes, excludes, imports),
// with a transitional legacy extractor. Callers pass a debug scope label so
// debugFallback messages remain stable for existing tests.
import { readFile } from 'node:fs/promises';

import {
  type ContextConfig,
  DEFAULT_STAN_PATH,
  findConfigPathSync,
  loadConfig,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';
import YAML from 'yaml';

import { debugFallback } from '@/runner/util/debug';

const parseText = (p: string, text: string): unknown =>
  p.endsWith('.json')
    ? (JSON.parse(text) as unknown)
    : (YAML.parse(text) as unknown);

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object';

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const normalizeImports = (
  raw: unknown,
): Record<string, string[]> | undefined => {
  if (!isObj(raw)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string') continue;
    if (Array.isArray(v)) {
      const arr = v.filter((x): x is string => typeof x === 'string');
      if (arr.length) out[k] = arr;
    } else if (typeof v === 'string' && v.trim().length) {
      out[k] = [v];
    }
  }
  return Object.keys(out).length ? out : undefined;
};

/**
 * Resolve effective engine ContextConfig with a legacy extractor.
 *
 * @param cwd - Repo root (or descendant). The nearest config is used.
 * @param debugScope - Label for debugFallback when synthesizing from legacy root keys.
 */
export const resolveEffectiveEngineConfig = async (
  cwd: string,
  debugScope = 'config.effective:engine-legacy',
): Promise<ContextConfig> => {
  // Happy path — namespaced engine loader
  try {
    return await loadConfig(cwd);
  } catch {
    // continue to fallback
  }

  const p = findConfigPathSync(cwd);
  if (p) {
    try {
      const raw = await readFile(p, 'utf8');
      const rootUnknown: unknown = parseText(p, raw);
      const root = isObj(rootUnknown) ? rootUnknown : {};

      const stanCore = isObj(root['stan-core']) ? root['stan-core'] : null;
      if (stanCore) {
        // Minimal fallback when loader failed but stan-core node exists:
        // prefer stan-core.stanPath; otherwise resolve or default.
        const sp = stanCore['stanPath'];
        const stanPath =
          typeof sp === 'string' && sp.trim().length
            ? sp
            : (() => {
                try {
                  return resolveStanPathSync(cwd);
                } catch {
                  return DEFAULT_STAN_PATH;
                }
              })();
        return { stanPath } as ContextConfig;
      }

      // Legacy root keys extractor (transitional)
      const stanPathRaw = root['stanPath'];
      const stanPath =
        typeof stanPathRaw === 'string' && stanPathRaw.trim().length
          ? stanPathRaw
          : (() => {
              try {
                return resolveStanPathSync(cwd);
              } catch {
                return DEFAULT_STAN_PATH;
              }
            })();
      const includes = toStringArray(root['includes']);
      const excludes = toStringArray(root['excludes']);
      const imports = normalizeImports(root['imports']);

      debugFallback(
        debugScope,
        `synthesized engine config from legacy root keys in ${p.replace(/\\/g, '/')}`,
      );
      return { stanPath, includes, excludes, imports };
    } catch {
      // fall through to default
    }
  }

  // No config file found or parse error — default stanPath
  let stanPathFallback = DEFAULT_STAN_PATH;
  try {
    stanPathFallback = resolveStanPathSync(cwd);
  } catch {
    /* ignore */
  }
  return { stanPath: stanPathFallback } as ContextConfig;
};
