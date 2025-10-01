/* src/stan/patch/open.ts
 * Open modified files in an editor based on a configurable command template.
 * Template tokens:
 *   {file}  -> repo-relative path to the modified file
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { alert, error } from '@/stan/util/color';

const isDeleted = (cwd: string, rel: string): boolean =>
  !existsSync(path.resolve(cwd, rel));
/**
 * Open modified files in the configured editor.
 *
 * Behavior:
 * - Skips deleted paths.
 * - Skips entirely during tests unless `STAN_FORCE_OPEN=1`.
 * - Spawns detached processes; does not await completion.
 *
 * @param args - Object with:
 *   - cwd: Repo root used as the working directory.
 *   - files: Repo‑relative file paths to open.
 *   - openCommand: Command template containing `\{file\}` token.
 */
export const openFilesInEditor = (args: {
  cwd: string;
  files: string[];
  openCommand?: string | null | undefined; // e.g., "code -g {file}"
}): void => {
  const { cwd, files, openCommand } = args;
  const safeFiles = files.filter((f) => !isDeleted(cwd, f));
  if (!safeFiles.length) return;

  if (!openCommand || !openCommand.includes('{file}')) {
    console.log(
      alert(
        'stan: no open command configured; run `stan init` and set patchOpenCommand (e.g., "code -g {file}")',
      ),
    );
    return;
  }

  for (const rel of safeFiles) {
    const cmdLine = openCommand.replaceAll('{file}', rel);
    // Log first so tests can assert behavior without requiring a real spawn.
    console.log(`stan: open -> ${alert(rel)}`);

    // In tests, do not spawn at all. Detached child processes can keep the
    // working directory locked briefly on Windows and cause EBUSY/ENOTEMPTY
    // during teardown. The log above provides sufficient observability.
    if (process.env.NODE_ENV === 'test') {
      continue;
    }

    try {
      const child = spawn(cmdLine, {
        cwd,
        shell: true,
        windowsHide: true,
        stdio: 'ignore',
        detached: true,
      });
      child.unref();
    } catch {
      console.log(
        error(
          `stan: open failed for ${rel}; run \`stan init\` to configure patchOpenCommand`,
        ),
      );
    }
  }
};
