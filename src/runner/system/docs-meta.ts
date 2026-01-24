/* src/stan/system/docs-meta.ts
 * Helpers to read/update .stan/system/.docs.meta.json (preserving unknown keys).
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ensureDir } from 'fs-extra';

export type DocsMeta = Record<string, unknown> & {
  version?: string;
  prompt?: {
    source?: 'local' | 'core' | 'path';
    hash?: string;
    path?: string;
  } & Record<string, unknown>;
};

const metaPath = (cwd: string, stanPath: string): string =>
  path.join(cwd, stanPath, 'system', '.docs.meta.json');

export const readDocsMeta = async (
  cwd: string,
  stanPath: string,
): Promise<DocsMeta | null> => {
  try {
    const raw = await readFile(metaPath(cwd, stanPath), 'utf8');
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === 'object') return v as DocsMeta;
  } catch {
    /* ignore */
  }
  return null;
};

export const updateDocsMetaPrompt = async (
  cwd: string,
  stanPath: string,
  prompt: { source: 'local' | 'core' | 'path'; hash?: string; path?: string },
): Promise<void> => {
  const p = metaPath(cwd, stanPath);
  let base: DocsMeta = {};
  try {
    const raw = await readFile(p, 'utf8');
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === 'object') base = v as DocsMeta;
  } catch {
    base = {};
  }
  const next: DocsMeta = {
    ...base,
    prompt: { ...(base.prompt ?? {}), ...prompt },
  };
  await ensureDir(path.dirname(p));
  await writeFile(p, JSON.stringify(next, null, 2), 'utf8');
};
