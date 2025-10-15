/* src/stan/snap/snap-run.ts
 * Snapshot capture operation with optional stash.
 */
import { writeArchiveSnapshot } from '@karmaniverous/stan-core';

import { loadCliConfig } from '@/cli/config/load';
import { resolvePromptSource } from '@/runner/run/prompt';
import { updateDocsMetaPrompt } from '@/runner/system/docs-meta';
import { sha256File } from '@/runner/util/hash';

import { utcStamp } from '../util/time';
import { captureSnapshotAndArchives } from './capture';
import { resolveContext } from './context';
import { runGit } from './git';
import { readSelection } from './selection';
export const handleSnap = async (opts?: { stash?: boolean }): Promise<void> => {
  const { cwd, stanPath, maxUndos } = await resolveContext(process.cwd());
  const wantStash = Boolean(opts?.stash);
  let attemptPop = false;

  if (wantStash) {
    const res = await runGit(cwd, ['stash', '-u']);
    if (res.code === 0 && !/No local changes to save/i.test(res.stdout)) {
      attemptPop = true;
      console.log('stan: stash saved changes');
    } else if (res.code === 0) {
      // Nothing to stash is a successful no-op; print a concise confirmation.
      console.log('stan: no local changes to stash');
    } else if (res.code !== 0) {
      console.error(
        'stan: git stash -u failed; snapshot aborted (no changes made)',
      );
      // Visual separation from next prompt
      console.log('');
      return;
    }
  }

  // Resolve selection from repo config so the snapshot and diff use the same rules
  const { includes: cfgIncludes, excludes: cfgExcludes } = await readSelection(
    cwd,
  ).catch(() => ({
    stanPath,
    includes: [] as string[],
    excludes: [] as string[],
  }));

  try {
    await writeArchiveSnapshot({
      cwd,
      stanPath,
      includes: cfgIncludes,
      excludes: cfgExcludes,
    });
  } catch (e) {
    console.error('stan: snapshot write failed', e);
    if (wantStash && attemptPop) {
      const pop = await runGit(cwd, ['stash', 'pop']);
      if (pop.code !== 0) {
        console.error('stan: git stash pop failed');
      }
    }
    // Visual separation from next prompt
    console.log('');
    return;
  }

  // Record effective prompt identity (baseline-at-snap): source/hash/path?
  try {
    const cli = await loadCliConfig(cwd);
    const choice =
      typeof cli.cliDefaults?.run?.prompt === 'string' &&
      cli.cliDefaults.run.prompt.trim().length
        ? cli.cliDefaults.run.prompt.trim()
        : 'auto';
    const rp = resolvePromptSource(cwd, stanPath, choice);
    // Hash the effective source bytes
    let hash: string | undefined;
    try {
      hash = await sha256File(rp.abs);
    } catch {
      hash = undefined;
    }
    const pathForMeta = rp.kind === 'path' ? rp.abs : undefined;
    await updateDocsMetaPrompt(cwd, stanPath, {
      source: rp.kind,
      hash,
      path: pathForMeta,
    });
  } catch {
    // best-effort; missing hash/path is acceptable
  }

  const ts = utcStamp();
  await captureSnapshotAndArchives({
    cwd,
    stanPath,
    ts,
    maxUndos,
  });

  if (wantStash && attemptPop) {
    const pop = await runGit(cwd, ['stash', 'pop']);
    if (pop.code !== 0) {
      console.error('stan: git stash pop failed');
    } else {
      console.log('stan: stash pop restored changes');
    }
  }

  console.log('stan: snapshot updated');
  // Visual separation from next prompt
  console.log('');
};
