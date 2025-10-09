// src/stan/patch/editor.ts
import { spawn } from 'node:child_process';

import { DEFAULT_OPEN_COMMAND } from '@karmaniverous/stan-core';

/** Open a set of repo-relative files in the configured editor (best-effort). */
export const maybeOpenFiles = (
  cwd: string,
  paths: string[],
  patchOpenCommand?: string,
): void => {
  try {
    if (!paths.length) return;
    if (process.env.STAN_OPEN_EDITOR === '0') return;
    if (process.env.NODE_ENV === 'test') return;
    const openCmd =
      typeof patchOpenCommand === 'string' && patchOpenCommand.trim().length
        ? patchOpenCommand.trim()
        : DEFAULT_OPEN_COMMAND;
    for (const rel of paths) {
      const cmd = openCmd.replace(/\{file\}/g, rel);
      const child = spawn(cmd, {
        cwd,
        shell: true,
        detached: true,
        stdio: 'ignore',
      });
      try {
        child.unref();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
};
