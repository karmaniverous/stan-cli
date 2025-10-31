// src/stan/snap/capture.ts
import { existsSync } from 'node:fs';
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';

import {
  ARCH_DIR,
  ensureDirs,
  readJson,
  SNAP_DIR,
  type SnapEntry,
  type SnapState,
  STATE_FILE,
  within,
  writeJson,
} from './shared';

/**
 * Capture the current snapshot and (optionally) current archives into history,
 * then update diff/.snap.state.json with bounded retention.
 *
 * - Copies <stanPath>/diff/.archive.snapshot.json to diff/snapshots/snap-<ts>.json
 * - If present, copies <stanPath>/output/archive.tar and archive.diff.tar to diff/archives/
 * - Pushes a new entry, clears any redos, and trims to maxUndos (oldest first),
 *   deleting dropped files best-effort.
 */
export const captureSnapshotAndArchives = async ({
  cwd,
  stanPath,
  ts,
  maxUndos,
}: {
  cwd: string;
  stanPath: string;
  ts: string;
  maxUndos: number;
}): Promise<void> => {
  const diffDir = within(cwd, stanPath, 'diff');
  const outDir = within(cwd, stanPath, 'output');
  // ensureDirs will create as needed below

  const statePath = within(diffDir, STATE_FILE);
  const snapsDir = within(diffDir, SNAP_DIR);
  const archDir = within(diffDir, ARCH_DIR);

  await ensureDirs([diffDir, snapsDir, archDir]);

  // Copy current snapshot body into history file
  const currentSnapAbs = within(diffDir, '.archive.snapshot.json');
  const snapRel = within(SNAP_DIR, `snap-${ts}.json`);
  const snapAbs = within(diffDir, snapRel);

  try {
    const body = await readFile(currentSnapAbs, 'utf8');
    await writeFile(snapAbs, body, 'utf8');
  } catch {
    // best-effort
  }

  // Optionally capture current archives if present
  let archRel: string | undefined;
  let archDiffRel: string | undefined;

  const outArchive = within(outDir, 'archive.tar');
  const outDiff = within(outDir, 'archive.diff.tar');

  try {
    if (existsSync(outArchive)) {
      archRel = within(ARCH_DIR, `archive-${ts}.tar`);
      await copyFile(outArchive, within(diffDir, archRel));
    }
    if (existsSync(outDiff)) {
      archDiffRel = within(ARCH_DIR, `archive-${ts}.diff.tar`);
      await copyFile(outDiff, within(diffDir, archDiffRel));
    }
  } catch {
    // best-effort
  }

  // Load or initialize state
  const st = (await readJson<SnapState>(statePath)) ?? {
    entries: [],
    index: -1,
    maxUndos,
  };

  // Drop redos when we’re not at tip
  if (st.index >= 0 && st.index < st.entries.length - 1) {
    st.entries = st.entries.slice(0, st.index + 1);
  }

  // Push new entry and advance pointer
  const entry: SnapEntry = {
    ts,
    snapshot: snapRel,
    archive: archRel,
    archiveDiff: archDiffRel,
  };
  st.entries.push(entry);
  st.index = st.entries.length - 1;

  // Trim oldest beyond retention; remove dropped files best-effort
  const maxKeep = st.maxUndos;
  while (st.entries.length > maxKeep) {
    const drop = st.entries.shift();
    if (drop) {
      try {
        await rm(within(diffDir, drop.snapshot), { force: true });
      } catch {
        // ignore
      }
      if (drop.archive) {
        try {
          await rm(within(diffDir, drop.archive), { force: true });
        } catch {
          // ignore
        }
      }
      if (drop.archiveDiff) {
        try {
          await rm(within(diffDir, drop.archiveDiff), { force: true });
        } catch {
          // ignore
        }
      }
    }
    st.index = Math.max(0, st.entries.length - 1);
  }

  await writeJson(statePath, st);
};
