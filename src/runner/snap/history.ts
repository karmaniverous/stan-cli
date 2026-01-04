/* src/runner/snap/history.ts
 * Snapshot history helpers (CLI handlers over shared SnapState).
 * - Indexing is 0‑based across read/write.
 * - Clamp incoming indices; do not apply +/-1 adjustments.
 * - Backed by <stanPath>/diff/.snap.state.json (shared constant and shape).
 */
import { existsSync, readFileSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';

import {
  findConfigPathSync,
  resolveStanPathSync,
} from '@karmaniverous/stan-core';

import { parseText } from '@/common/config/parse';

import { readJson, type SnapState, STATE_FILE, writeJson } from './shared';

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

export const statePath = (cwd: string, stanPath: string): string =>
  path.join(cwd, stanPath, 'diff', STATE_FILE);

const snapshotBaselinePath = (diffDirAbs: string): string =>
  path.join(diffDirAbs, '.archive.snapshot.json');

const findConfigPathUpwards = (start: string): string | null => {
  const names = ['stan.config.yml', 'stan.config.yaml', 'stan.config.json'];
  let cur = start;
  for (;;) {
    for (const n of names) {
      try {
        const p = path.join(cur, n);
        if (existsSync(p)) return p;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
};

const readStanPathFromConfig = (cfgPath: string): string | null => {
  try {
    const raw = readFileSync(cfgPath, 'utf8');
    const rootUnknown: unknown = parseText(cfgPath, raw);
    if (!rootUnknown || typeof rootUnknown !== 'object') return null;
    const root = rootUnknown as Record<string, unknown>;
    const core = root['stan-core'];
    if (core && typeof core === 'object') {
      const sp = (core as { stanPath?: unknown }).stanPath;
      if (typeof sp === 'string' && sp.trim().length > 0) return sp.trim();
    }
    // Legacy fallback (ensure tests/older configs still work)
    const legacy = (root as { stanPath?: unknown }).stanPath;
    if (typeof legacy === 'string' && legacy.trim().length > 0)
      return legacy.trim();
  } catch {
    /* ignore */
  }
  return null;
};

const readSnapState = async (p: string): Promise<SnapState | null> => {
  return (await readJson<SnapState>(p)) ?? null;
};

const writeSnapState = async (p: string, s: SnapState): Promise<void> => {
  const max = s.entries.length > 0 ? s.entries.length - 1 : 0;
  const idx = clamp(s.index, 0, max);
  await writeJson(p, { ...s, index: idx });
};

const setIndexSnap = async (
  p: string,
  rawIndex: string,
): Promise<SnapState | null> => {
  const cur = await readSnapState(p);
  if (!cur) return null;
  const n = Number.parseInt(rawIndex, 10);
  const max = cur.entries.length > 0 ? cur.entries.length - 1 : 0;
  const next = Number.isFinite(n) ? clamp(n, 0, max) : cur.index;
  await writeSnapState(p, { ...cur, index: next });
  return (await readSnapState(p)) ?? null;
};

const undoSnap = async (p: string): Promise<SnapState | null> => {
  const cur = await readSnapState(p);
  if (!cur) return null;
  const max = cur.entries.length > 0 ? cur.entries.length - 1 : 0;
  const next = clamp(cur.index - 1, 0, max);
  await writeSnapState(p, { ...cur, index: next });
  return (await readSnapState(p)) ?? null;
};

const redoSnap = async (p: string): Promise<SnapState | null> => {
  const cur = await readSnapState(p);
  if (!cur) return null;
  const max = cur.entries.length > 0 ? cur.entries.length - 1 : 0;
  const next = clamp(cur.index + 1, 0, max);
  await writeSnapState(p, { ...cur, index: next });
  return (await readSnapState(p)) ?? null;
};

/**
 * Restore the active diff snapshot baseline (<stanPath>/diff/.archive.snapshot.json)
 * from the currently selected snap entry in <stanPath>/diff/.snap.state.json.
 *
 * This is the missing link that makes undo/redo/set affect `stan run` diffs.
 */
const restoreSnapshotBaseline = async (
  snapStateAbs: string,
  st: SnapState,
): Promise<{ restored: boolean; ts?: string }> => {
  // Guard: nothing to restore
  const entry = st.entries[st.index];
  if (!entry.snapshot) return { restored: false };

  const diffDirAbs = path.dirname(snapStateAbs);
  const src = path.join(diffDirAbs, entry.snapshot);
  const dest = snapshotBaselinePath(diffDirAbs);

  try {
    if (!existsSync(src)) return { restored: false, ts: entry.ts };
  } catch {
    return { restored: false, ts: entry.ts };
  }

  try {
    await copyFile(src, dest);
    return { restored: true, ts: entry.ts };
  } catch {
    return { restored: false, ts: entry.ts };
  }
};

/**
 * CLI handlers (snap subcommands)
 * - resolve stanPath robustly
 * - operate on the history file under <stanPath>/diff/.snap.state.json
 */
const resolveRepoRoot = (): string => {
  const cwd = process.cwd();
  // Prefer core's resolver, but it may return null without throwing.
  // Fall back to a direct upward scan for repos/tests without package.json.
  const cfgPath = (() => {
    try {
      return findConfigPathSync(cwd);
    } catch {
      return null;
    }
  })();
  const chosen = cfgPath ?? findConfigPathUpwards(cwd);
  return chosen ? path.dirname(chosen) : cwd;
};

const resolveHistoryPath = (): string => {
  const repoRoot = resolveRepoRoot();
  // Prefer the configured stanPath; probe legacy/common names for existing files.
  let configured: string = '.stan';
  try {
    configured = resolveStanPathSync(repoRoot);
  } catch {
    // Fallback: derive stanPath by parsing stan.config.* directly when core
    // resolution cannot locate config from the current working directory.
    const cfgPath =
      (() => {
        try {
          return findConfigPathSync(repoRoot);
        } catch {
          return null;
        }
      })() ?? findConfigPathUpwards(repoRoot);
    const fromCfg = cfgPath ? readStanPathFromConfig(cfgPath) : null;
    if (fromCfg) configured = fromCfg;
  }
  // Probe order: configured first (real repos), then common test/legacy names.
  const ordered = [configured, 'out', 'stan', '.stan'] as const;
  const candidates: string[] = Array.from(
    new Set<string>(ordered.filter(Boolean).map((s) => s)),
  );
  for (const sp of candidates) {
    const p = statePath(repoRoot, sp);
    try {
      if (existsSync(p)) return p;
    } catch {
      /* ignore unreadable paths; try next */
    }
  }
  // None exist yet: select the configured workspace path.
  return statePath(repoRoot, configured);
};

const printMove = (
  action: 'undo' | 'redo' | 'set',
  st: SnapState,
  restore: { restored: boolean; ts?: string },
): void => {
  const base = `stan: snap history: ${action} -> index ${st.index.toString()} of ${st.entries.length.toString()}`;
  const ts = restore.ts ? ` (ts ${restore.ts})` : '';
  const note = restore.restored ? '' : ' (baseline not restored)';
  console.log(`${base}${ts}${note}`);
};

export const handleUndo = async (): Promise<void> => {
  try {
    const p = resolveHistoryPath();
    const st = await undoSnap(p);
    if (!st) return;
    const restore = await restoreSnapshotBaseline(p, st);
    printMove('undo', st, restore);
  } catch {
    /* best‑effort */
  }
};

export const handleRedo = async (): Promise<void> => {
  try {
    const p = resolveHistoryPath();
    const st = await redoSnap(p);
    if (!st) return;
    const restore = await restoreSnapshotBaseline(p, st);
    printMove('redo', st, restore);
  } catch {
    /* best‑effort */
  }
};

export const handleSet = async (indexArg: string): Promise<void> => {
  try {
    const p = resolveHistoryPath();
    const st = await setIndexSnap(p, indexArg);
    if (!st) return;
    const restore = await restoreSnapshotBaseline(p, st);
    printMove('set', st, restore);
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
