// src/runner/init/service/snapshot.ts
import { existsSync } from 'node:fs';
import path from 'node:path';

import { writeArchiveSnapshot } from '@karmaniverous/stan-core';

import { withImplicitImportsInclude } from '@/runner/selection/implicit-imports';

import { resolveIncludesExcludes } from './selection';

export const snapshotPath = (cwd: string, stanPath: string): string =>
  path.join(cwd, stanPath, 'diff', '.archive.snapshot.json');

export const writeSnapshot = async (
  cwd: string,
  stanPath: string,
  base: Record<string, unknown>,
  dryRun: boolean,
): Promise<void> => {
  const sel = resolveIncludesExcludes(base);
  if (dryRun) return;
  const includes = withImplicitImportsInclude(stanPath, sel.includes);
  await writeArchiveSnapshot({
    cwd,
    stanPath,
    includes,
    excludes: sel.excludes,
  });
};

/** Handle snapshot creation/retention flow. */
export const handleSnapshot = async (args: {
  cwd: string;
  stanPath: string;
  base: Record<string, unknown>;
  force: boolean;
  dryRun: boolean;
}): Promise<void> => {
  const { cwd, stanPath, base, force, dryRun } = args;
  const snapP = snapshotPath(cwd, stanPath);
  const snapExists = existsSync(snapP);

  if (!snapExists) {
    if (!dryRun) {
      await writeSnapshot(cwd, stanPath, base, dryRun);
      console.log('stan: snapshot updated');
    } else {
      console.log('stan: snapshot unchanged (dry-run)');
    }
    return;
  }

  if (force) {
    console.log(
      dryRun
        ? 'stan: snapshot unchanged (dry-run)'
        : 'stan: snapshot unchanged',
    );
    return;
  }

  try {
    if (!dryRun) {
      const { default: inquirer } = (await import('inquirer')) as {
        default: { prompt: (qs: unknown[]) => Promise<unknown> };
      };
      const ans = (await inquirer.prompt([
        {
          type: 'confirm',
          name: 'keep',
          message: 'Keep existing snapshot?',
          default: true,
        },
      ])) as { keep?: boolean };
      if (ans.keep === false) {
        await writeSnapshot(cwd, stanPath, base, false);
        console.log('stan: snapshot updated');
      } else {
        console.log('stan: snapshot unchanged');
      }
    } else {
      console.log('stan: snapshot unchanged (dry-run)');
    }
  } catch {
    // Prompt failed; keep snapshot silently (best-effort).
    console.log(
      dryRun
        ? 'stan: snapshot unchanged (dry-run)'
        : 'stan: snapshot unchanged',
    );
  }
};
