// src/stan/loop/state.ts
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ensureDir } from 'fs-extra';

export type LoopCmd = 'run' | 'snap' | 'patch';
export type LoopState = { last: LoopCmd; ts: string };

const ORDER: Record<LoopCmd, number> = { run: 0, snap: 1, patch: 2 };

export const loopStatePath = (cwd: string, stanPath: string): string =>
  path.join(cwd, stanPath, 'diff', '.loop.state.json');

export const readLoopState = async (
  cwd: string,
  stanPath: string,
): Promise<LoopState | null> => {
  try {
    const p = loopStatePath(cwd, stanPath);
    const raw = await readFile(p, 'utf8');
    const v = JSON.parse(raw) as { last?: string; ts?: string };
    if (v.last === 'run' || v.last === 'snap' || v.last === 'patch') {
      return {
        last: v.last,
        ts: typeof v.ts === 'string' ? v.ts : '',
      };
    }
  } catch {
    // ignore
  }
  return null;
};

export const writeLoopState = async (
  cwd: string,
  stanPath: string,
  last: LoopCmd,
  ts: string,
): Promise<void> => {
  const p = loopStatePath(cwd, stanPath);
  await ensureDir(path.dirname(p));
  await writeFile(p, JSON.stringify({ last, ts }, null, 2), 'utf8');
};

/** True when moving backward through the loop (order: run-\>snap-\>patch-\>run) */
export const isBackward = (prev: LoopCmd, current: LoopCmd): boolean => {
  const a = ORDER[prev];
  const b = ORDER[current];
  // backward when current === (prev + 2) % 3
  return b === (a + 2) % 3;
};
