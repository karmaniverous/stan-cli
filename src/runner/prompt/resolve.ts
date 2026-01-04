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
import { packageDirectorySync } from 'package-directory';

/** Resolve the absolute path to core's packaged stan.system.md, or null if unavailable. */
export const resolveCorePromptPath = (): string | null => {
  // Primary: engine helper
  try {
    const p = getPackagedSystemPromptPath();
    if (p && existsSync(p)) return p;
  } catch {
    /* ignore */
  }

  // Fallback A: resolve core's entry, then use package-directory to locate its package root.
  try {
    const req = createRequire(import.meta.url);
    const mainEntry = req.resolve('@karmaniverous/stan-core');
    const pkgRoot =
      packageDirectorySync({ cwd: path.dirname(mainEntry) }) ?? null;
    if (pkgRoot) {
      const candidate = path.join(pkgRoot, 'dist', 'stan.system.md');
      if (existsSync(candidate)) return candidate;
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
    const pkgRoot = packageDirectorySync({ cwd: path.dirname(here) }) ?? null;
    if (pkgRoot) {
      const candidate = path.join(pkgRoot, 'dist', 'stan.system.md');
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    /* ignore */
  }
  return null;
};
