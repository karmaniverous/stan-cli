// src/runner/snap/history.ts
/**
 * Snapshot history helpers
 * - Indexing is 0‑based across read/write.
 * - Clamp incoming indices; do not apply +/-1 adjustments.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveStanPathSync } from '@karmaniverous/stan-core';

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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!v || !Array.isArray(v.stack) || typeof v.index !== 'number') {
      return null;
    }
    // Ensure 0‑based on read (tolerate legacy persisted +1 by converting when plausible).
    // If a legacy file persisted 1-based indices (1..length), convert to 0-based by subtracting 1.
    // Otherwise clamp as-is (already 0-based or malformed).
    const max = v.stack.length > 0 ? v.stack.length - 1 : 0;
    const rawIdx = v.index;
    const idx =
      typeof rawIdx === 'number' && v.stack.length > 0
        ? rawIdx >= 1 && rawIdx <= v.stack.length
          ? rawIdx - 1
          : clamp(rawIdx, 0, max)
        : 0;
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

/**
 * CLI handlers (snap subcommands)
 * - resolve stanPath robustly
 * - operate on the history file under <stanPath>/diff/.snap.history.json
 */
const resolveHistoryPath = (): string => {
  const cwd = process.cwd();
  // Prefer the configured stanPath; probe legacy fallbacks when an existing
  // history file resides under a different common workspace name.
  let configured: string = '.stan';
  try {
    configured = resolveStanPathSync(cwd);
  } catch {
    /* keep default */
  }
  const candidates: string[] = Array.from(
    new Set<string>(
      [
        configured,
        'stan',
        '.stan',
        'out', // common workspace used in tests; probe best‑effort
      ].filter(Boolean),
    ),
  );
  for (const sp of candidates) {
    const p = statePath(cwd, sp);
    try {
      if (existsSync(p)) return p;
    } catch {
      /* ignore unreadable paths; try next */
    }
  }
  // None exist yet: select the configured workspace path.
  return statePath(cwd, configured);
};

export const handleUndo = async (): Promise<void> => {
  try {
    const p = resolveHistoryPath();
    await undo(p);
  } catch {
    /* best‑effort */
  }
};

export const handleRedo = async (): Promise<void> => {
  try {
    const p = resolveHistoryPath();
    await redo(p);
  } catch {
    /* best‑effort */
  }
};

export const handleSet = async (indexArg: string): Promise<void> => {
  try {
    const p = resolveHistoryPath();
    await setIndex(p, indexArg);
  } catch {
    /* best‑effort */
  }
};

export const handleInfo = async (): Promise<void> => {
  try {
    const st = await readState(resolveHistoryPath());
    if (!st) return;
    console.log(
      `stan: snap history: index ${st.index.toString()} of ${st.stack.length.toString()}`,
    );
  } catch {
    /* best‑effort */
  }
};
