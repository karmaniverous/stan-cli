/** src/stan/prompt/resolve.ts
 * Resolve the packaged core prompt path with a robust fallback.
 * Primary: \@karmaniverous/stan-core.getPackagedSystemPromptPath()
 * Fallback: locate core's package root via createRequire() and join dist/stan.system.md.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { getPackagedSystemPromptPath } from '@karmaniverous/stan-core';

/** Resolve the absolute path to core's packaged stan.system.md, or null if unavailable. */
export const resolveCorePromptPath = (): string | null => {
  // Primary: engine helper
  try {
    const p = getPackagedSystemPromptPath();
    if (p && existsSync(p)) return p;
  } catch {
    /* fall through */
  }
  // Fallback: anchor at core's package root resolved relative to this module.
  try {
    const req = createRequire(import.meta.url);
    const pkgJson = req.resolve('@karmaniverous/stan-core/package.json');
    const root = path.dirname(pkgJson);
    const candidate = path.join(root, 'dist', 'stan.system.md');
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
};
