// src/test-support/run.ts
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ExecutionMode, RunBehavior, RunnerConfig } from '@/runner/run';
import { runSelected } from '@/runner/run';

export const writeScript = async (
  root: string,
  rel: string,
  src: string,
): Promise<string> => {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, src, 'utf8');
  return abs;
};

export const startRun = (args: {
  cwd: string;
  config: RunnerConfig;
  selection: string[] | null;
  mode: ExecutionMode;
  behavior?: RunBehavior;
  promptChoice?: string;
}): {
  run: Promise<string[]>;
  cancel: (kind: 'sigint' | 'keypress') => void;
  paths: {
    outDir: string;
    archiveTar: string;
    diffTar: string;
    outFile: (key: string) => string;
    exists: (p: string) => boolean;
  };
} => {
  const { cwd, config, selection, mode, behavior, promptChoice } = args;
  const outDir = path.join(cwd, config.stanPath, 'output');
  const archiveTar = path.join(outDir, 'archive.tar');
  const diffTar = path.join(outDir, 'archive.diff.tar');
  const outFile = (key: string) => path.join(outDir, `${key}.txt`);
  const exists = (p: string) => existsSync(p);
  const run = runSelected(cwd, config, selection, mode, behavior, promptChoice);
  const cancel = (kind: 'sigint' | 'keypress') => {
    if (kind === 'sigint') {
      try {
        process.emit('SIGINT');
      } catch {
        /* ignore */
      }
    } else {
      try {
        (
          process.stdin as unknown as {
            emit?: (ev: string, d?: unknown) => void;
          }
        ).emit?.('data', 'q');
      } catch {
        /* ignore */
      }
    }
  };
  return {
    run,
    cancel,
    paths: { outDir, archiveTar, diffTar, outFile, exists },
  };
};
