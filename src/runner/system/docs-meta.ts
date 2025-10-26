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
  overlay?: {
    enabled?: boolean;
    activated?: string[];
    deactivated?: string[];
    effective?: Record<string, boolean>;
    autosuspended?: string[];
    anchorsKept?: Record<string, number>;
    /** Per-facet count of inactive subtree roots retained after enabled-wins filtering. */
    overlapKept?: Record<string, number>;
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

export const updateDocsMetaOverlay = async (
  cwd: string,
  stanPath: string,
  overlay: {
    enabled: boolean;
    activated?: string[];
    deactivated?: string[];
    effective?: Record<string, boolean>;
    autosuspended?: string[];
    anchorsKept?: Record<string, number>;
    /** Optional per-facet kept counts after tie-breakers. */
    overlapKept?: Record<string, number>;
  },
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
    overlay: {
      ...(base.overlay ?? {}),
      enabled: overlay.enabled,
      activated:
        overlay.activated ??
        (base.overlay as { activated?: string[] } | undefined)?.activated,
      deactivated:
        overlay.deactivated ??
        (base.overlay as { deactivated?: string[] } | undefined)?.deactivated,
      effective:
        overlay.effective ??
        (base.overlay as { effective?: Record<string, boolean> } | undefined)
          ?.effective,
      autosuspended:
        overlay.autosuspended ??
        (base.overlay as { autosuspended?: string[] } | undefined)
          ?.autosuspended,
      anchorsKept:
        overlay.anchorsKept ??
        (base.overlay as { anchorsKept?: Record<string, number> } | undefined)
          ?.anchorsKept,
      overlapKept:
        overlay.overlapKept ??
        (base.overlay as { overlapKept?: Record<string, number> } | undefined)
          ?.overlapKept,
    },
  };
  await ensureDir(path.dirname(p));
  await writeFile(p, JSON.stringify(next, null, 2), 'utf8');
};
