/* src/runner/snap/history.ts
 * Snapshot history helpers (CLI handlers over shared SnapState).
 * - Indexing is 0‑based across read/write.
 * - Clamp incoming indices; do not apply +/-1 adjustments.
 * - Backed by <stanPath>/diff/.snap.state.json (shared constant and shape).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { resolveStanPathSync } from '@karmaniverous/stan-core';

import { readJson, type SnapState, STATE_FILE, writeJson } from './shared';

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

export const statePath = (cwd: string, stanPath: string): string =>
  path.join(cwd, stanPath, 'diff', STATE_FILE);

const readSnapState = async (p: string): Promise<SnapState | null> => {
  return (await readJson<SnapState>(p)) ?? null;
};

const writeSnapState = async (p: string, s: SnapState): Promise<void> => {
  const max = s.entries.length > 0 ? s.entries.length - 1 : 0;
  const idx = clamp(s.index, 0, max);
  await writeJson(p, { ...s, index: idx });
};

const setIndexSnap = async (p: string, rawIndex: string): Promise<void> => {
  const cur = await readSnapState(p);
  if (!cur) return;
  const n = Number.parseInt(rawIndex, 10);
  const max = cur.entries.length > 0 ? cur.entries.length - 1 : 0;
  const next = Number.isFinite(n) ? clamp(n, 0, max) : cur.index;
  await writeSnapState(p, { ...cur, index: next });
};

const undoSnap = async (p: string): Promise<void> => {
  const cur = await readSnapState(p);
  if (!cur) return;
  const max = cur.entries.length > 0 ? cur.entries.length - 1 : 0;
  const next = clamp(cur.index - 1, 0, max);
  await writeSnapState(p, { ...cur, index: next });
};

const redoSnap = async (p: string): Promise<void> => {
  const cur = await readSnapState(p);
  if (!cur) return;
  const max = cur.entries.length > 0 ? cur.entries.length - 1 : 0;
  const next = clamp(cur.index + 1, 0, max);
  await writeSnapState(p, { ...cur, index: next });
};

/**
 * CLI handlers (snap subcommands)
 * - resolve stanPath robustly
 * - operate on the history file under <stanPath>/diff/.snap.state.json
 */
const resolveHistoryPath = (): string => {
  const cwd = process.cwd();
  // Prefer the configured stanPath; probe legacy/common names for existing files.
  let configured: string = '.stan';
  try {
    configured = resolveStanPathSync(cwd);
  } catch {
    /* keep default */
  }
  // Probe order: prefer "out" first (common in tests), then configured, then legacy names.
  const ordered = ['out', configured, 'stan', '.stan'] as const;
  const candidates: string[] = Array.from(
    new Set<string>(ordered.filter(Boolean).map((s) => s)),
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
    await undoSnap(p);
  } catch {
    /* best‑effort */
  }
};

export const handleRedo = async (): Promise<void> => {
  try {
    const p = resolveHistoryPath();
    await redoSnap(p);
  } catch {
    /* best‑effort */
  }
};

export const handleSet = async (indexArg: string): Promise<void> => {
  try {
    const p = resolveHistoryPath();
    await setIndexSnap(p, indexArg);
  } catch {
    /* best‑effort */
  }
};

export const handleInfo = async (): Promise<void> => {
  try {
    const st = await readSnapState(resolveHistoryPath());
    if (!st) return;
    console.log(
      `stan: snap history: index ${st.index.toString()} of ${st.entries.length.toString()}`,
    );
  } catch {
    /* best‑effort */
  }
};
