import { readFileSync } from 'node:fs';

import { findConfigPathSync } from '@karmaniverous/stan-core';

import { loadCliConfigSync } from '@/cli/config/load';
import { parseText } from '@/common/config/parse';

/**
 * Render a help footer that lists available script keys and examples. *
 * @param cwd - Repo root (or descendant) used to locate `stan.config.*`.
 * @returns Multi‑line string (empty when config cannot be loaded).
 *
 * Notes:
 * - Examples reflect the new flags (`-s`, `-x`, `-q`) and defaults (run all + archives).
 * - When `STAN_DEBUG=1`, logs the reason configuration could not be loaded.
 */
export const renderAvailableScriptsHelp = (cwd: string): string => {
  try {
    const cfg = loadCliConfigSync(cwd);
    let keys = Object.keys(cfg.scripts);
    // Fallback: parse stan.config.* directly (namespaced first; legacy root) when loader yields no scripts.
    if (!keys.length) {
      const p = findConfigPathSync(cwd);
      if (p) {
        try {
          const raw = readFileSync(p, 'utf8');
          const rootUnknown: unknown = parseText(p, raw);
          const root =
            rootUnknown && typeof rootUnknown === 'object'
              ? (rootUnknown as Record<string, unknown>)
              : {};
          const cliNs =
            root['stan-cli'] && typeof root['stan-cli'] === 'object'
              ? (root['stan-cli'] as Record<string, unknown>)
              : null;
          const scriptsNode =
            (cliNs && typeof cliNs['scripts'] === 'object'
              ? (cliNs['scripts'] as Record<string, unknown>)
              : (root as { scripts?: Record<string, unknown> }).scripts) ?? {};
          keys = Object.keys(scriptsNode);
        } catch {
          // best-effort; fall through
        }
      }
    }
    if (!keys.length) return '';
    const example = keys[0] || 'lint';
    return [
      '',
      'Default: runs all scripts and writes archives.',
      '',
      'Available script keys:',
      `  ${keys.join(', ')}`,
      '',
      'Examples:',
      '  stan run                  # all scripts, with archives',
      `  stan run -s ${example}`,
      `  stan run -q -x ${example}`,
      '  stan run -A               # no archives',
      '  stan run -S -A -p         # plan only, no scripts, no archives',
      `  stan run -c -s ${example}`,
      '',
    ].join('\n');
  } catch (e) {
    if (process.env.STAN_DEBUG === '1') {
      console.error('stan: unable to load config for help footer', e);
    }
    return '';
  }
};
