/* src/stan/snap/snap-run.ts
 * Snapshot capture operation with optional stash.
 */
import { loadConfig } from '@/stan/config';

import { writeArchiveSnapshot } from '../diff';
import { preflightDocsAndVersion } from '../preflight';
import { utcStamp } from '../util/time';
import { captureSnapshotAndArchives } from './capture';
import { resolveContext } from './context';
import { runGit } from './git';
export const handleSnap = async (opts?: { stash?: boolean }): Promise<void> => {
  const { cwd, stanPath, maxUndos } = await resolveContext(process.cwd());
  // Always-on prompt/version/docs checks (best-effort; consistent with run/patch)
  try {
    await preflightDocsAndVersion(cwd);
  } catch (err) {
    if (process.env.STAN_DEBUG === '1')
      console.error(
        'stan: preflight failed',
        err instanceof Error ? err.message : String(err),
      );
  }
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
      return;
    }
  }

  // Resolve selection from repo config so the snapshot and diff use the same rules
  let cfgIncludes: string[] = [];
  let cfgExcludes: string[] = [];
  try {
    const cfg = await loadConfig(cwd);
    cfgIncludes = Array.isArray(cfg.includes) ? cfg.includes : [];
    cfgExcludes = Array.isArray(cfg.excludes) ? cfg.excludes : [];
  } catch {
    // best‑effort; fall back to empty arrays
  }

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
    return;
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
};
