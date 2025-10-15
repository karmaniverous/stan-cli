/** src/stan/prompt/resolve.ts
 * Resolve the packaged core prompt path with robust fallbacks.
 * Order:
 *   1) \@karmaniverous/stan-core.getPackagedSystemPromptPath()
 *   2) createRequire(import.meta.url).resolve('\@karmaniverous/stan-core') → walk up to module root → dist/stan.system.md
 *   3) createRequire(import.meta.url).resolve('\@karmaniverous/stan-core/dist/stan.system.md')
 *
 * Note: CLI fallback (dist/stan.system.md within this package) is handled upstream as kind='path'
 * via getCliPackagedSystemPromptPath() and should not be returned from this resolver.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPackagedSystemPromptPath } from '@karmaniverous/stan-core';

/** Resolve the absolute path to core's packaged stan.system.md, or null if unavailable. */
export const resolveCorePromptPath = (): string | null => {
  // Primary: engine helper
  try {
    const p = getPackagedSystemPromptPath();
    if (p && existsSync(p)) return p;
  } catch {
    /* ignore */
  }

  // Fallback A: resolve core's main entry, walk up to the module root "stan-core", then join dist/stan.system.md
  try {
    const req = createRequire(import.meta.url);
    const mainEntry = req.resolve('@karmaniverous/stan-core');
    let dir = path.dirname(mainEntry);
    for (let i = 0; i < 10; i += 1) {
      const base = path.basename(dir);
      if (base === 'stan-core') {
        const candidate = path.join(dir, 'dist', 'stan.system.md');
        if (existsSync(candidate)) return candidate;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* ignore */
  }

  // Fallback B: subpath resolution when exports permit
  try {
    const req = createRequire(import.meta.url);
    const candidate = req.resolve(
      '@karmaniverous/stan-core/dist/stan.system.md',
    );
    if (candidate && existsSync(candidate)) return candidate;
  } catch {
    /* ignore */
  }

  return null;
};

/**
 * Resolve the CLI-packaged prompt path (this package's dist/stan.system.md), or null if absent.
 * This is intended as a last-resort "path" fallback when the core package cannot be located.
 */
export const getCliPackagedSystemPromptPath = (): string | null => {
  try {
    const here = fileURLToPath(import.meta.url);
    let dir = path.dirname(here);
    // Walk upward to find a "dist/stan.system.md" near the package root.
    for (let i = 0; i < 8; i += 1) {
      const distDir = path.join(dir, 'dist');
      const candidate = path.join(distDir, 'stan.system.md');
      if (existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* ignore */
  }
  return null;
};
