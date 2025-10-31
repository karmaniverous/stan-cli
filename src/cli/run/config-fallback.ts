// src/cli/run/config-fallback.ts
/**
 * SSR/mock‑robust fallbacks for reading CLI scripts and run.scripts defaults
 * straight from stan.config.* when lazy import shapes are unavailable.
 *
 * Preference order (when a config is present):
 * - namespaced:   root['stan-cli'].\{ scripts, cliDefaults.run.scripts \}
 * - legacy root:  root.\{ scripts, cliDefaults.run.scripts \}
 */
import {
  normalizeScriptsNode,
  pickCliNode,
  readRawConfigSync,
} from '@/cli/config/raw';

const normalizeScripts = (node: unknown): Record<string, string> => {
  return normalizeScriptsNode(node);
};

export const readCliScriptsFallback = (cwd: string): Record<string, string> => {
  const root = readRawConfigSync(cwd);
  // Prefer namespaced stan-cli.scripts
  const cliNode = pickCliNode(root);
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
  const root = readRawConfigSync(cwd);
  // Prefer namespaced stan-cli.cliDefaults.run.scripts
  const cliNode = pickCliNode(root);
  if (
    cliNode &&
    cliNode.cliDefaults &&
    typeof cliNode.cliDefaults === 'object'
  ) {
    const runNode = (cliNode.cliDefaults as { run?: { scripts?: unknown } })
      .run;
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
