import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ensureDir } from 'fs-extra';

export const STATE_FILE = '.snap.state.json';
export const SNAP_DIR = 'snapshots';
export const ARCH_DIR = 'archives';
export const within = (...parts: string[]): string => path.join(...parts);

/**
 * Ensure all provided directories exist (best‑effort).
 *
 * @param paths - Absolute directory paths to create (recursively).
 * @returns A promise that resolves when creation attempts finish.
 */
export const ensureDirs = async (paths: string[]): Promise<void> => {
  await Promise.all(paths.map((p) => ensureDir(p)));
};
/**
 * Read and parse a JSON file, returning `null` on failure.
 *
 * @param p - Absolute file path.
 * @returns Parsed value or `null` if the file is missing or invalid.
 */
export const readJson = async <T>(p: string): Promise<T | null> => {
  try {
    const raw = await readFile(p, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/**
 * Write a JSON value to a file with 2‑space indentation.
 *
 * @param p - Absolute destination path.
 * @param v - Value to serialize.
 */
export const writeJson = async (p: string, v: unknown): Promise<void> => {
  await writeFile(p, JSON.stringify(v, null, 2), 'utf8');
};
/** History entry recorded in diff/.snap.state.json (relative paths under <stanPath>/diff). */
export type SnapEntry = {
  ts: string;
  snapshot: string;
  archive?: string;
  archiveDiff?: string;
};

/** Snapshot history state with bounded undo depth. */
export type SnapState = {
  entries: SnapEntry[];
  index: number;
  maxUndos: number;
};
