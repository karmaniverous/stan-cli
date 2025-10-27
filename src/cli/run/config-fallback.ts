// src/cli/run/config-fallback.ts
/**
 * SSR/mock‑robust fallbacks for reading CLI scripts and run.scripts defaults
 * straight from stan.config.* when lazy import shapes are unavailable.
 *
 * Preference order (when a config is present):
 * - namespaced:   root['stan-cli'].\{ scripts, cliDefaults.run.scripts \}
 * - legacy root:  root.\{ scripts, cliDefaults.run.scripts \}
 */
import { readFileSync } from 'node:fs';

import { findConfigPathSync } from '@karmaniverous/stan-core';

import { parseText } from '@/common/config/parse';

const getRoot = (cwd: string): Record<string, unknown> => {
  const cfgPath = findConfigPathSync(cwd);
  if (!cfgPath) return {};
  try {
    const raw = readFileSync(cfgPath, 'utf8');
    const rootUnknown = parseText(cfgPath, raw);
    return rootUnknown && typeof rootUnknown === 'object'
      ? (rootUnknown as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const normalizeScripts = (node: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!node || typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim().length) {
      out[k] = v;
    } else if (
      v &&
      typeof v === 'object' &&
      typeof (v as { script?: unknown }).script === 'string'
    ) {
      out[k] = String((v as { script?: string }).script);
    }
  }
  return out;
};

export const readCliScriptsFallback = (cwd: string): Record<string, string> => {
  const root = getRoot(cwd);
  // Prefer namespaced stan-cli.scripts
  const cliNode =
    root['stan-cli'] && typeof root['stan-cli'] === 'object'
      ? (root['stan-cli'] as Record<string, unknown>)
      : null;
  if (cliNode && cliNode.scripts && typeof cliNode.scripts === 'object') {
    return normalizeScripts(cliNode.scripts);
  }
  // Legacy root-level scripts
  if (root.scripts && typeof root.scripts === 'object') {
    return normalizeScripts(root.scripts);
  }
  return {};
};

export const readRunScriptsDefaultFallback = (
  cwd: string,
): boolean | string[] | undefined => {
  const root = getRoot(cwd);
  // Prefer namespaced stan-cli.cliDefaults.run.scripts
  const cliNode =
    root['stan-cli'] && typeof root['stan-cli'] === 'object'
      ? (root['stan-cli'] as Record<string, unknown>)
      : null;
  if (
    cliNode &&
    cliNode.cliDefaults &&
    typeof cliNode.cliDefaults === 'object'
  ) {
    const runNode = (
      cliNode.cliDefaults as {
        run?: { scripts?: unknown };
      }
    ).run;
    const v = runNode?.scripts;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v))
      return v.filter((x): x is string => typeof x === 'string');
  }
  // Legacy root-level cliDefaults.run.scripts
  if (root.cliDefaults && typeof root.cliDefaults === 'object') {
    const runNode = (
      root.cliDefaults as {
        run?: { scripts?: unknown };
      }
    ).run;
    const v = runNode?.scripts;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v))
      return v.filter((x): x is string => typeof x === 'string');
  }
  return undefined;
};
