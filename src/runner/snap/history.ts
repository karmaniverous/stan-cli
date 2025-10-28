/* src/stan/snap/history.ts
 * Snapshot history operations: undo, redo, set, info.
 * Keeps the CLI-visible API compatible with previous handlers.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { formatUtcStampLocal } from '../util/time';
import { resolveContext } from './context';
import {
  readJson,
  type SnapState,
  STATE_FILE,
  within,
  writeJson,
} from './shared';

const getStatePaths = (cwd: string, stanPath: string) => {
  const diffDir = path.join(cwd, stanPath, 'diff');
  const statePath = within(diffDir, STATE_FILE);
  const snapPath = within(diffDir, '.archive.snapshot.json');
  return { diffDir, statePath, snapPath };
};

/** Restore the snapshot for a target index and update the in-memory state. */
const restoreEntryAt = async (
  st: SnapState,
  nextIndex: number,
  diffDir: string,
  snapPath: string,
): Promise<{ st: SnapState; ts: string } | null> => {
  if (nextIndex < 0 || nextIndex >= st.entries.length) return null;
  const entry = st.entries[nextIndex];
  const snapAbs = within(diffDir, entry.snapshot);
  const body = await readFile(snapAbs, 'utf8');
  await writeFile(snapPath, body, 'utf8');
  st.index = nextIndex;
  return { st, ts: entry.ts };
};

const ensureState = async (
  statePath: string,
  maxUndos: number,
): Promise<SnapState> => {
  const st = (await readJson<SnapState>(statePath)) ?? {
    entries: [],
    index: -1,
    maxUndos,
  };
  // normalize maxUndos if missing
  if (!st.maxUndos) st.maxUndos = maxUndos;
  return st;
};

/**
 * Revert to the previous snapshot in the history stack.
 * Restores `.archive.snapshot.json`, updates the state file, and logs a summary.
 *
 * @returns A promise that resolves when the operation completes.
 */
export const handleUndo = async (): Promise<void> => {
  const { cwd, stanPath, maxUndos } = await resolveContext(process.cwd());
  const { diffDir, statePath, snapPath } = getStatePaths(cwd, stanPath);
  const st = await ensureState(statePath, maxUndos);
  if (st.entries.length === 0 || st.index <= 0) {
    console.log('stan: nothing to undo');
    return;
  }
  const next = await restoreEntryAt(st, st.index - 1, diffDir, snapPath).catch(
    (err: unknown) => {
      console.error('stan: failed to restore snapshot', err);
      return null;
    },
  );
  if (!next) return;
  await writeJson(statePath, st);
  const undos = st.index;
  const redos = st.entries.length - 1 - st.index;
  console.log(
    `stan: undo -> ${next.ts} (undos left ${undos.toString()}, redos left ${redos.toString()})`,
  );
};

/**
 * Advance to the next snapshot in the history stack.
 * Restores `.archive.snapshot.json`, updates the state file, and logs a summary.
 *
 * @returns A promise that resolves when the operation completes.
 */
export const handleRedo = async (): Promise<void> => {
  const { cwd, stanPath, maxUndos } = await resolveContext(process.cwd());
  const { diffDir, statePath, snapPath } = getStatePaths(cwd, stanPath);
  const st = await ensureState(statePath, maxUndos);
  if (st.entries.length === 0 || st.index >= st.entries.length - 1) {
    console.log('stan: nothing to redo');
    return;
  }
  const next = await restoreEntryAt(st, st.index + 1, diffDir, snapPath).catch(
    (err: unknown) => {
      console.error('stan: failed to restore snapshot', err);
      return null;
    },
  );
  if (!next) return;
  await writeJson(statePath, st);
  const undos = st.index;
  const redos = st.entries.length - 1 - st.index;
  console.log(
    `stan: redo -> ${next.ts} (undos left ${undos.toString()}, redos left ${redos.toString()})`,
  );
};

/**
 * Activate a specific snapshot by index and make it current.
 * Overwrites the active `.archive.snapshot.json` with the selected entry
 * and updates the state file.
 *
 * @param indexArg - Index string (0‑based) to select; must be within range.
 * @returns A promise that resolves when the operation completes.
 */
export const handleSet = async (indexArg: string): Promise<void> => {
  const idx = Number.parseInt(indexArg, 10);
  if (!Number.isFinite(idx) || idx < 0) {
    console.error('stan: invalid index');
    return;
  }
  const { cwd, stanPath, maxUndos } = await resolveContext(process.cwd());
  const { diffDir, statePath, snapPath } = getStatePaths(cwd, stanPath);

  const st = await ensureState(statePath, maxUndos);
  if (idx < 0 || idx >= st.entries.length) {
    console.error('stan: index out of range');
    return;
  }
  const next = await restoreEntryAt(st, idx, diffDir, snapPath).catch(
    () => null,
  );
  if (!next) return;
  await writeJson(statePath, st);
  const undos = st.index;
  const redos = st.entries.length - 1 - st.index;
  console.log(
    `stan: set -> ${next.ts} (undos left ${undos.toString()}, redos left ${redos.toString()})`,
  );
};

/**
 * Print a summary of the snapshot stack with the current index highlighted.
 *
 * @returns A promise that resolves when printing is complete.
 */
export const handleInfo = async (): Promise<void> => {
  const { cwd, stanPath, maxUndos } = await resolveContext(process.cwd());
  const { statePath } = getStatePaths(cwd, stanPath);
  const st = await ensureState(statePath, maxUndos);
  const undos = Math.max(0, st.index);
  const redos =
    st.entries.length > 0 ? Math.max(0, st.entries.length - 1 - st.index) : 0;

  console.log('stan: snap stack (newest → oldest)');
  if (st.entries.length === 0) {
    console.log('  (empty)');
  } else {
    st.entries
      .map((e, i) => ({ e, i }))
      .reverse()
      .forEach(({ e, i }) => {
        const mark = i === st.index ? '*' : ' ';
        const hasArch = Boolean(e.archive);
        const hasDiff = Boolean(e.archiveDiff);
        const local = formatUtcStampLocal(e.ts);
        const file = path.basename(e.snapshot);
        console.log(
          `  ${mark} [${i.toString()}] ${local}  file: ${file}  archive: ${
            hasArch ? 'yes' : 'no'
          }  diff: ${hasDiff ? 'yes' : 'no'}`,
        );
      });
  }
  console.log(
    `  current index: ${st.index.toString()}  undos left: ${undos.toString()}  redos left: ${redos.toString()}`,
  );
};
