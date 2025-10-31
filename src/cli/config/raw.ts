// src/cli/config/raw.ts
/**
 * Minimal, shared raw config reader used by sync fallbacks.
 * Centralizes:
 *  - nearest stan.config.* path resolution,
 *  - UTF-8 read,
 *  - YAML/JSON parse (via parseText),
 *  - object-shape guard.
 */
import { readFileSync } from 'node:fs';

import { findConfigPathSync } from '@karmaniverous/stan-core';

import { parseText } from '@/common/config/parse';

/** Read and parse the nearest stan.config.* into a mutable object; \{\} on failure. */
export const readRawConfigSync = (dir?: string): Record<string, unknown> => {
  try {
    const p = findConfigPathSync(dir ?? process.cwd());
    if (!p) return {};
    const raw = readFileSync(p, 'utf8');
    const rootUnknown: unknown = parseText(p, raw);
    return rootUnknown && typeof rootUnknown === 'object'
      ? (rootUnknown as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

/** Narrow helper: return stan-cli node when present; otherwise null. */
export const pickCliNode = (
  root: Record<string, unknown>,
): Record<string, unknown> | null => {
  const n = root['stan-cli'];
  return n && typeof n === 'object' ? (n as Record<string, unknown>) : null;
};

/** Normalize a scripts-like node into Record\<string,string\>. */
export const normalizeScriptsNode = (node: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!node || typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim().length) out[k] = v;
    else if (
      v &&
      typeof v === 'object' &&
      typeof (v as { script?: unknown }).script === 'string'
    ) {
      out[k] = String((v as { script?: string }).script);
    }
  }
  return out;
};
