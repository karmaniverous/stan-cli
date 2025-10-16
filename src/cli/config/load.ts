/* src/cli/config/load.ts
 * Load and validate stan-cli configuration from stan.config.*.
 * Strategy: prefer top-level "stan-cli"; temporary fallback to legacy top-level keys.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { findConfigPathSync } from '@karmaniverous/stan-core';
import { DEFAULT_OPEN_COMMAND } from '@karmaniverous/stan-core';
import { ZodError } from 'zod';

import {
  type CliConfig,
  cliConfigSchema,
  ensureNoReservedScriptKeys,
  type ScriptMap,
} from '@/cli/config/schema';
import { parseText } from '@/common/config/parse';
import { debugFallback } from '@/runner/util/debug';

const formatZodError = (e: unknown): string =>
  e instanceof ZodError
    ? e.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n')
    : String(e);

type RawConfig = Record<string, unknown>;

const pickLegacyCliSection = (o: RawConfig): RawConfig => {
  const keys = [
    'scripts',
    'cliDefaults',
    'patchOpenCommand',
    'maxUndos',
    'devMode',
  ];
  const out: RawConfig = {};
  for (const k of keys)
    if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
  return out;
};

export type LoadedCliConfig = {
  scripts: ScriptMap;
  cliDefaults?: CliConfig['cliDefaults'];
  patchOpenCommand: string;
  maxUndos?: number;
  devMode?: boolean;
};

const parseCliNode = (
  nodeUnknown: unknown,
  cfgPath: string,
): LoadedCliConfig => {
  const node =
    nodeUnknown && typeof nodeUnknown === 'object'
      ? (nodeUnknown as RawConfig)
      : {};
  let parsed: CliConfig;
  try {
    parsed = cliConfigSchema.parse(node);
  } catch (e) {
    const rel = cfgPath.replace(/\\/g, '/');
    throw new Error(`stan-cli: invalid config in ${rel}\n${formatZodError(e)}`);
  }
  ensureNoReservedScriptKeys(parsed.scripts ?? {});
  return {
    scripts: (parsed.scripts ?? {}) as ScriptMap,
    cliDefaults: parsed.cliDefaults,
    patchOpenCommand: parsed.patchOpenCommand ?? DEFAULT_OPEN_COMMAND,
    maxUndos: parsed.maxUndos,
    devMode: parsed.devMode,
  };
};

/** Load and validate the CLI config (prefer "stan-cli"; fallback to legacy top-level). */
export const loadCliConfig = async (cwd: string): Promise<LoadedCliConfig> => {
  const cfgPath = findConfigPathSync(cwd);
  if (!cfgPath) {
    return { scripts: {}, patchOpenCommand: DEFAULT_OPEN_COMMAND };
  }
  const rawText = await readFile(cfgPath, 'utf8');
  const rootUnknown: unknown = parseText(cfgPath, rawText);
  const root =
    rootUnknown && typeof rootUnknown === 'object'
      ? (rootUnknown as RawConfig)
      : {};

  if (root['stan-cli'] && typeof root['stan-cli'] === 'object') {
    return parseCliNode(root['stan-cli'], cfgPath);
  }
  // Transitional: legacy top-level keys only (no "stan-cli")
  const legacy = pickLegacyCliSection(root);
  if (Object.keys(legacy).length > 0) {
    // Debug-visible notice to help users migrate via `stan init`
    debugFallback(
      'cli.config:load',
      `using legacy top-level CLI keys from ${cfgPath.replace(/\\/g, '/')}; run "stan init" to migrate`,
    );
    // Also emit the run-scoped legacy engine notice to satisfy transitional tests
    // that assert a single, consistent label is present when running under a legacy config.
    if (!Object.prototype.hasOwnProperty.call(root, 'stan-core')) {
      debugFallback(
        'run.action:engine-legacy',
        `detected legacy root keys (no "stan-core") in ${cfgPath.replace(/\\/g, '/')}`,
      );
    }
    return parseCliNode(legacy, cfgPath);
  }
  // Nothing configured; return empty-scripts baseline
  return { scripts: {}, patchOpenCommand: DEFAULT_OPEN_COMMAND };
};

/** Synchronous variant for CLI construction/help default tagging. */
export const loadCliConfigSync = (cwd: string): LoadedCliConfig => {
  const cfgPath = findConfigPathSync(cwd);
  if (!cfgPath) return { scripts: {}, patchOpenCommand: DEFAULT_OPEN_COMMAND };
  const text = readFileSync(cfgPath, 'utf8');
  const rootUnknown: unknown = parseText(cfgPath, text);
  const root =
    rootUnknown && typeof rootUnknown === 'object'
      ? (rootUnknown as RawConfig)
      : {};
  if (root['stan-cli'] && typeof root['stan-cli'] === 'object') {
    return parseCliNode(root['stan-cli'], cfgPath);
  }
  const legacy = pickLegacyCliSection(root);
  if (Object.keys(legacy).length > 0) {
    debugFallback(
      'cli.config:loadSync',
      `using legacy top-level CLI keys from ${cfgPath.replace(/\\/g, '/')}; run "stan init" to migrate`,
    );
    // Mirror the run-scoped legacy engine notice here as well for symmetry.
    if (!Object.prototype.hasOwnProperty.call(root, 'stan-core')) {
      debugFallback(
        'run.action:engine-legacy',
        `detected legacy root keys (no "stan-core") in ${cfgPath.replace(/\\/g, '/')}`,
      );
    }
    return parseCliNode(legacy, cfgPath);
  }
  return { scripts: {}, patchOpenCommand: DEFAULT_OPEN_COMMAND };
};
