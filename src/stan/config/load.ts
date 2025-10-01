/* src/stan/config/load.ts
 * Load/parse STAN configuration and resolve stanPath.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import YAML from 'yaml';
import { ZodError } from 'zod';

import { DEFAULT_OPEN_COMMAND, DEFAULT_STAN_PATH } from './defaults';
import { findConfigPathSync } from './discover';
import { ConfigSchema, type ParsedConfig } from './schema';
import type { ContextConfig } from './types';

const formatZodError = (e: unknown): string => {
  if (!(e instanceof ZodError)) return String(e);
  return e.issues
    .map((i) => {
      const path = i.path.join('.') || '(root)';
      // Friendly specialization for tests/UX: canonical wording for stanPath type mismatch.
      let msg = i.message;
      if (path === 'stanPath' && /Expected string/i.test(msg)) {
        msg = 'stanPath must be a non-empty string';
      }
      return `${path}: ${msg}`;
    })
    .join('\n');
};

/** Normalize imports: string -\> [string]; arrays trimmed; invalid -\> undefined. */
const normalizeImports = (v: unknown): Record<string, string[]> | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(o)) {
    const raw = o[k];
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (s) out[k] = [s];
    } else if (Array.isArray(raw)) {
      const arr = raw
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((s) => s.length > 0);
      if (arr.length) out[k] = arr;
    }
  }
  return Object.keys(out).length ? out : undefined;
};

const ensureNoReservedScriptKeys = (scripts: Record<string, unknown>): void => {
  const bad = ['archive', 'init'].filter((k) =>
    Object.prototype.hasOwnProperty.call(scripts ?? {}, k),
  );
  if (bad.length > 0) {
    // Keep message stable for tests: /archive.*init.*not allowed/i
    throw new Error(`scripts: keys "archive" and "init" not allowed`);
  }
};

const parseFile = async (abs: string): Promise<ContextConfig> => {
  const raw = await readFile(abs, 'utf8');
  const cfgUnknown: unknown = abs.endsWith('.json')
    ? (JSON.parse(raw) as unknown)
    : (YAML.parse(raw) as unknown);
  let parsed: ParsedConfig;
  try {
    parsed = ConfigSchema.parse(cfgUnknown);
  } catch (e) {
    throw new Error(formatZodError(e));
  }

  // Guard against reserved CLI script names.
  ensureNoReservedScriptKeys(parsed.scripts ?? {});

  const importsNormalized = normalizeImports(parsed.imports);
  return {
    stanPath: parsed.stanPath,
    scripts: parsed.scripts,
    includes: parsed.includes ?? [],
    excludes: parsed.excludes ?? [],
    imports: importsNormalized,
    maxUndos: parsed.maxUndos,
    devMode: parsed.devMode,
    patchOpenCommand: parsed.patchOpenCommand ?? DEFAULT_OPEN_COMMAND,
    cliDefaults: parsed.cliDefaults,
  };
};

/**
 * Load and validate STAN configuration synchronously.
 *
 * @param cwd - Repo root or any descendant; the nearest `stan.config.*` is used.
 * @returns Parsed, validated {@link ContextConfig}.
 */
export const loadConfigSync = (cwd: string): ContextConfig => {
  const p = findConfigPathSync(cwd);
  if (!p) throw new Error('stan config not found');
  const raw = readFileSync(p, 'utf8');
  const cfgUnknown: unknown = p.endsWith('.json')
    ? (JSON.parse(raw) as unknown)
    : (YAML.parse(raw) as unknown);
  try {
    const parsed = ConfigSchema.parse(cfgUnknown);

    // Guard against reserved CLI script names.
    ensureNoReservedScriptKeys(parsed.scripts ?? {});

    const importsNormalized = normalizeImports(parsed.imports);
    return {
      stanPath: parsed.stanPath,
      scripts: parsed.scripts,
      includes: parsed.includes ?? [],
      excludes: parsed.excludes ?? [],
      imports: importsNormalized,
      maxUndos: parsed.maxUndos,
      devMode: parsed.devMode,
      patchOpenCommand: parsed.patchOpenCommand ?? DEFAULT_OPEN_COMMAND,
      cliDefaults: parsed.cliDefaults,
    };
  } catch (e) {
    throw new Error(formatZodError(e));
  }
};

/**
 * Load and validate STAN configuration (async).
 *
 * @param cwd - Repo root or any descendant; the nearest `stan.config.*` is used.
 * @returns Parsed, validated {@link ContextConfig}.
 */
export const loadConfig = async (cwd: string): Promise<ContextConfig> => {
  const p = findConfigPathSync(cwd);
  if (!p) throw new Error('stan config not found');
  return parseFile(p);
};

/** Resolve stanPath from config or fall back to default (sync). */
export const resolveStanPathSync = (cwd: string): string => {
  try {
    return loadConfigSync(cwd).stanPath;
  } catch {
    return DEFAULT_STAN_PATH;
  }
};

/** Resolve stanPath from config or fall back to default (async). */
export const resolveStanPath = async (cwd: string): Promise<string> => {
  try {
    const cfg = await loadConfig(cwd);
    return cfg.stanPath;
  } catch {
    return DEFAULT_STAN_PATH;
  }
};
