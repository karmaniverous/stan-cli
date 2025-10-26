// src/runner/init/service/workspace.ts
import path from 'node:path';

import { ensureOutputDir } from '@karmaniverous/stan-core';

import { ensureDocs } from '../docs';
import { ensureStanGitignore } from '../gitignore';

export const ensureWorkspace = async (
  cwd: string,
  stanPath: string,
  dryRun: boolean,
  targetPath: string,
): Promise<void> => {
  if (!dryRun) await ensureOutputDir(cwd, stanPath, true);
  if (!dryRun) {
    await ensureStanGitignore(cwd, stanPath);
    await ensureDocs(cwd, stanPath);
    console.log(`stan: wrote ${path.basename(targetPath)}`);
  } else {
    console.log(
      `stan: init (dry-run): would write ${path.basename(targetPath)}`,
    );
  }
};
