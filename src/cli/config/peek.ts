// src/cli/config/peek.ts
/**
 * Consolidated helpers to emit the transitional legacy notice (debugFallback)
 * when the nearest stan.config.* lacks a top-level "stan-core" section.
 *
 * Provides both async and sync variants for use in action handlers and
 * Commander hooks, respectively.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { findConfigPathSync } from '@karmaniverous/stan-core';

import { maybeDebugLegacy } from '@/cli/config/legacy';
import { parseText } from '@/common/config/parse';

export const peekAndMaybeDebugLegacySync = (
  scopeLabel: string,
  cwd: string = process.cwd(),
): void => {
  try {
    const p = findConfigPathSync(cwd);
    if (!p) return;
    const raw = readFileSync(p, 'utf8');
    const rootUnknown: unknown = parseText(p, raw);
    maybeDebugLegacy(scopeLabel, p, rootUnknown);
  } catch {
    /* best-effort */
  }
};

export const peekAndMaybeDebugLegacy = async (
  scopeLabel: string,
  cwd: string = process.cwd(),
): Promise<void> => {
  try {
    const p = findConfigPathSync(cwd);
    if (!p) return;
    const raw = await readFile(p, 'utf8');
    const rootUnknown: unknown = parseText(p, raw);
    maybeDebugLegacy(scopeLabel, p, rootUnknown);
  } catch {
    /* best-effort */
  }
};
