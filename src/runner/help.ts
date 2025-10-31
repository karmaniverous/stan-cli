import { loadCliConfigSync } from '@/cli/config/load';
import {
  normalizeScriptsNode,
  pickCliNode,
  readRawConfigSync,
} from '@/cli/config/raw';

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
      try {
        const root = readRawConfigSync(cwd);
        const cli = pickCliNode(root);
        const scriptsNode =
          (cli && typeof cli['scripts'] === 'object'
            ? (cli['scripts'] as Record<string, unknown>)
            : (root as { scripts?: Record<string, unknown> }).scripts) ?? {};
        keys = Object.keys(normalizeScriptsNode(scriptsNode));
      } catch {
        /* best-effort */
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
