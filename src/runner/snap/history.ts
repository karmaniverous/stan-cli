// src/runner/snap/history.ts
/**
 * Snapshot history helpers
 * - Indexing is 0‑based across read/write.
 * - Clamp incoming indices; do not apply +/-1 adjustments.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type HistoryState = {
  stack: string[]; // ISO strings or labels
  index: number; // 0‑based
};

export const statePath = (cwd: string, stanPath: string): string =>
  path.join(cwd, stanPath, 'diff', '.snap.history.json');

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

export const readState = async (p: string): Promise<HistoryState | null> => {
  try {
    const raw = await readFile(p, 'utf8');
    const v = JSON.parse(raw) as Partial<HistoryState>;
    if (!v || !Array.isArray(v.stack) || typeof v.index !== 'number') {
      return null;
    }
    // Ensure 0‑based on read (tolerate legacy persisted +1 by clamping)
    const idx = clamp(v.index, 0, v.stack.length ? v.stack.length - 1 : 0);
    return { stack: v.stack, index: idx };
  } catch {
    return null;
  }
};

export const writeState = async (p: string, s: HistoryState): Promise<void> => {
  const idx = clamp(s.index, 0, s.stack.length ? s.stack.length - 1 : 0);
  const out: HistoryState = { stack: s.stack, index: idx };
  await writeFile(p, JSON.stringify(out, null, 2), 'utf8');
};

export const setIndex = async (
  p: string,
  rawIndex: string,
): Promise<HistoryState | null> => {
  const cur = await readState(p);
  if (!cur) return null;
  const n = Number.parseInt(rawIndex, 10);
  const next = Number.isFinite(n)
    ? clamp(n, 0, cur.stack.length - 1)
    : cur.index;
  const out: HistoryState = { ...cur, index: next };
  await writeState(p, out);
  return out;
};

export const push = async (p: string, label: string): Promise<HistoryState> => {
  const cur = (await readState(p)) ?? { stack: [], index: -1 };
  const pruned = cur.stack.slice(0, Math.max(0, cur.index + 1));
  const nextStack = [...pruned, label];
  const next: HistoryState = { stack: nextStack, index: nextStack.length - 1 };
  await writeState(p, next);
  return next;
};

export const undo = async (p: string): Promise<HistoryState | null> => {
  const cur = await readState(p);
  if (!cur) return null;
  const next = clamp(cur.index - 1, 0, cur.stack.length - 1);
  const out: HistoryState = { ...cur, index: next };
  await writeState(p, out);
  return out;
};

export const redo = async (p: string): Promise<HistoryState | null> => {
  const cur = await readState(p);
  if (!cur) return null;
  const next = clamp(cur.index + 1, 0, cur.stack.length - 1);
  const out: HistoryState = { ...cur, index: next };
  await writeState(p, out);
  return out;
};
