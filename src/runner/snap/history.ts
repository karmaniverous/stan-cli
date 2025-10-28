// src/runner/snap/history.ts
/**
 * Snap history helpers: persist a stack of snapshot bodies and navigate them.
 *
 * Semantics:
 * - State is persisted as 0-based:
 *   \{ stack: string[]; index: number \}
 * - handleSet(index) clamps and persists the provided index verbatim (0-based),
 *   then writes the selected snapshot body to <stanPath>/diff/.archive.snapshot.json.
 * - handleUndo/handleRedo adjust the index within [0, stack.length-1] and
 *   update the snapshot file accordingly.
 * - handleInfo prints a concise summary (size, index).
 *
 * Notes:
 * - No-op safely when history is missing/empty.
 * - Best-effort I/O; failures are swallowed to avoid noisy CLI behavior.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveStanPathSync } from '@karmaniverous/stan-core';

type HistoryState = {
  stack: string[];
  index: number; // 0-based
};

const historyPath = (cwd: string, stanPath: string): string =>
  path.join(cwd, stanPath, 'diff', '.snap.history.json');

const snapshotPath = (cwd: string, stanPath: string): string =>
  path.join(cwd, stanPath, 'diff', '.archive.snapshot.json');

const readJson = async <T>(abs: string): Promise<T | null> => {
  try {
    const raw = await readFile(abs, 'utf8');
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
};

const writeJson = async (abs: string, v: unknown): Promise<void> => {
  try {
    await writeFile(abs, JSON.stringify(v, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
};

const clampIndex = (i: number, size: number): number => {
  if (!Number.isFinite(i)) return 0;
  if (size <= 0) return 0;
  if (i < 0) return 0;
  if (i >= size) return size - 1;
  return i;
};

const loadState = async (
  cwd: string,
  stanPath: string,
): Promise<HistoryState | null> => {
  const p = historyPath(cwd, stanPath);
  if (!existsSync(p)) return null;
  const s = await readJson<HistoryState>(p);
  if (!s || !Array.isArray(s.stack) || typeof s.index !== 'number') return null;
  return s;
};

const saveState = async (
  cwd: string,
  stanPath: string,
  s: HistoryState,
): Promise<void> => {
  await writeJson(historyPath(cwd, stanPath), s);
};

const writeSnapshotBody = async (
  cwd: string,
  stanPath: string,
  body: string,
): Promise<void> => {
  try {
    await writeFile(snapshotPath(cwd, stanPath), body, 'utf8');
  } catch {
    /* ignore */
  }
};

/** Jump to an explicit 0-based index in the history and update the snapshot file. */
export const handleSet = async (indexArg: string): Promise<void> => {
  const cwd = process.cwd();
  let stanPath = '.stan';
  try {
    stanPath = resolveStanPathSync(cwd);
  } catch {
    /* keep default */
  }

  const state = await loadState(cwd, stanPath);
  if (!state || state.stack.length === 0) return;

  const parsed = Number.parseInt(indexArg, 10);
  const nextIdx = clampIndex(parsed, state.stack.length);

  const next: HistoryState = { stack: state.stack, index: nextIdx };
  await saveState(cwd, stanPath, next);

  const body = state.stack[nextIdx] ?? '';
  await writeSnapshotBody(cwd, stanPath, body);
};

/** Move one step back in history (if possible) and update the snapshot file. */
export const handleUndo = async (): Promise<void> => {
  const cwd = process.cwd();
  let stanPath = '.stan';
  try {
    stanPath = resolveStanPathSync(cwd);
  } catch {
    /* keep default */
  }

  const state = await loadState(cwd, stanPath);
  if (!state || state.stack.length === 0) return;

  const nextIdx = clampIndex(state.index - 1, state.stack.length);
  const next: HistoryState = { stack: state.stack, index: nextIdx };
  await saveState(cwd, stanPath, next);

  const body = state.stack[nextIdx] ?? '';
  await writeSnapshotBody(cwd, stanPath, body);
};

/** Move one step forward in history (if possible) and update the snapshot file. */
export const handleRedo = async (): Promise<void> => {
  const cwd = process.cwd();
  let stanPath = '.stan';
  try {
    stanPath = resolveStanPathSync(cwd);
  } catch {
    /* keep default */
  }

  const state = await loadState(cwd, stanPath);
  if (!state || state.stack.length === 0) return;

  const nextIdx = clampIndex(state.index + 1, state.stack.length);
  const next: HistoryState = { stack: state.stack, index: nextIdx };
  await saveState(cwd, stanPath, next);

  const body = state.stack[nextIdx] ?? '';
  await writeSnapshotBody(cwd, stanPath, body);
};

/** Print a concise summary of the current history stack and position. */
export const handleInfo = async (): Promise<void> => {
  const cwd = process.cwd();
  let stanPath = '.stan';
  try {
    stanPath = resolveStanPathSync(cwd);
  } catch {
    /* keep default */
  }

  const state = await loadState(cwd, stanPath);
  if (!state) {
    try {
      console.log('stan: snap history: none');
    } catch {
      /* ignore */
    }
    return;
  }
  const size = state.stack.length;
  const idx = clampIndex(state.index, size);
  try {
    console.log(
      `stan: snap history: size ${size.toString()}, index ${idx.toString()}`,
    );
  } catch {
    /* ignore */
  }
};
