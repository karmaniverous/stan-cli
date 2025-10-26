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

import { parseText } from '@/common/config/parse';
import { debugFallback } from '@/runner/util/debug';
import {
  DBG_SCOPE_EFFECTIVE_ENGINE_LEGACY,
  DBG_SCOPE_EFFECTIVE_STANPATH_FALLBACK,
} from '@/runner/util/debug-scopes';

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

/** Phase‑2: accept legacy engine shape only when explicitly enabled by env. */
const legacyAccepted = (): boolean => {
  try {
    const v = String(process.env.STAN_ACCEPT_LEGACY ?? '')
      .trim()
      .toLowerCase();
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
};
/**
 * Resolve effective engine ContextConfig with a legacy extractor.
 *
 * @param cwd - Repo root (or descendant). The nearest config is used.
 * @param debugScope - Label for debugFallback when synthesizing from legacy root keys.
 */
export async function resolveEffectiveEngineConfig(
  cwd: string,
  debugScope: string = DBG_SCOPE_EFFECTIVE_ENGINE_LEGACY,
): Promise<ContextConfig> {
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

      // Phase‑2 gate: config file exists but top‑level "stan-core" is missing.
      // Accept legacy only when env allows; otherwise fail early with clear guidance.
      if (!legacyAccepted()) {
        const rel = p.replace(/\\/g, '/');
        throw new Error(
          [
            `stan: legacy engine configuration detected in ${rel} (missing top-level "stan-core").`,
            `Run "stan init" to migrate your config,`,
            `or set STAN_ACCEPT_LEGACY=1 to temporarily accept legacy keys during the transition.`,
          ].join(' '),
        );
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
  try {
    // Concise, opt-in notice for fallback path resolution
    debugFallback(
      DBG_SCOPE_EFFECTIVE_STANPATH_FALLBACK,
      `using fallback stanPath "${stanPathFallback}" (no config found or parse failed)`,
    );
  } catch {
    /* ignore */
  }
  return { stanPath: stanPathFallback } as ContextConfig;
}
