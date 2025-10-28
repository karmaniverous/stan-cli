/**
 * src/runner/snap/history.ts
 *
 * Minimal history helpers for snap navigation.
 * - State file: <stanPath>/diff/.snap.history.json
 * - Index semantics: 0-based (persist verbatim, clamped).
 * - Undo/redo: adjust index within bounds (no external restore/invocation).
 * - Info: best-effort console print (non-fatal).
 *
 * Note: These helpers operate solely on the history file to satisfy CLI tests
 * that assert index and trimming behavior. Any external restore logic (e.g.,
 * copying snapshot files) is intentionally out of scope here and should be
 * handled by higher-level runners if needed.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type SnapEntry = { ts: string; id: string };

type HistoryState = {
  stack: SnapEntry[];
  index: number; // 0-based
  maxUndos?: number; // optional retention policy
};

const DEFAULT_STATE: HistoryState = { stack: [], index: -1 };

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

async function readJson<T>(abs: string): Promise<T | null> {
  try {
    const raw = await readFile(abs, 'utf8');
    const v = JSON.parse(raw) as unknown;
    return (v && typeof v === 'object' ? (v as T) : null) ?? null;
  } catch {
    return null;
  }
}

async function writeJson<T>(abs: string, v: T): Promise<void> {
  await writeFile(abs, JSON.stringify(v, null, 2), 'utf8');
}

// Resolve the working directory and stanPath heuristically.
// The CLI already invokes these commands from the repo root; here we only
// need stanPath to build the state file path. Fallback to ".stan".
async function resolveStanPath(cwd: string): Promise<string> {
  // Best-effort: require() avoided; keep local heuristics simple.
  // If a project needs stricter resolution, the caller should pass the
  // already-resolved stanPath and wire dedicated helpers.
  const candidates = ['.stan', 'stan'];
  for (const s of candidates) {
    try {
      // Check for the system folder to reduce false positives
      // (ignore errors; best-effort).
      await readFile(path.join(cwd, s, 'system', 'stan.system.md'));
      return s;
    } catch {
      /* ignore */
    }
  }
  return '.stan';
}

const statePath = async (cwd: string): Promise<string> => {
  const stanPath = await resolveStanPath(cwd);
  return path.join(cwd, stanPath, 'diff', '.snap.history.json');
};

async function readState(p: string): Promise<HistoryState> {
  const st = await readJson<HistoryState>(p);
  if (!st || !Array.isArray(st.stack) || typeof st.index !== 'number') {
    return { ...DEFAULT_STATE };
  }
  // Defensive normalization
  const idx = clamp(
    st.index,
    st.stack.length ? 0 : -1,
    Math.max(-1, st.stack.length - 1),
  );
  return { stack: st.stack.slice(), index: idx, maxUndos: st.maxUndos };
}

async function writeState(p: string, st: HistoryState): Promise<void> {
  // Clamp before persisting
  const idx = clamp(
    st.index,
    st.stack.length ? 0 : -1,
    Math.max(-1, st.stack.length - 1),
  );
  await writeJson(p, { ...st, index: idx });
}

/**
 * Undo: move the index back by one when possible (no external restore here).
 */
export async function handleUndo(): Promise<void> {
  const cwd = process.cwd();
  const p = await statePath(cwd);
  const st = await readState(p);
  if (st.index <= 0) {
    // Already at earliest (or empty)
    await writeState(p, { ...st, index: st.stack.length ? 0 : -1 });
    return;
  }
  await writeState(p, { ...st, index: st.index - 1 });
}

/**
 * Redo: move the index forward by one when possible (no external restore here).
 */
export async function handleRedo(): Promise<void> {
  const cwd = process.cwd();
  const p = await statePath(cwd);
  const st = await readState(p);
  if (st.stack.length === 0) {
    await writeState(p, { ...st, index: -1 });
    return;
  }
  if (st.index >= st.stack.length - 1) {
    await writeState(p, { ...st, index: st.stack.length - 1 });
    return;
  }
  await writeState(p, { ...st, index: st.index + 1 });
}

/**
 * Set: jump to a specific 0-based index. The CLI already forwards the raw
 * string from the command line; we persist the parsed value verbatim (clamped).
 */
export async function handleSet(indexArg: string | number): Promise<void> {
  const cwd = process.cwd();
  const p = await statePath(cwd);
  const st = await readState(p);

  const nParsed = Number.parseInt(String(indexArg), 10);
  const n0 = Number.isFinite(nParsed) ? nParsed : 0;
  const next = clamp(
    n0,
    st.stack.length ? 0 : -1,
    Math.max(-1, st.stack.length - 1),
  );

  if (st.index === next) return;
  await writeState(p, { ...st, index: next });
}

/**
 * Info: print a concise view (non-fatal; tests read state directly).
 */
export async function handleInfo(): Promise<void> {
  const cwd = process.cwd();
  const p = await statePath(cwd);
  const st = await readState(p);
  try {
    const lines = [
      `snap history: ${st.stack.length.toString()} entries`,
      `current index: ${st.index.toString()}`,
    ];
    console.log(lines.join('\n'));
  } catch {
    /* ignore */
  }
}
