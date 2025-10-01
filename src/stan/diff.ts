/**
 * Diff helpers for the stan tool (updated for stanPath layout).
 *
 * - Always create <baseName>.diff.tar under <stanPath>/output whenever the archive script runs.
 * - Snapshot lives under <stanPath>/diff/.archive.snapshot.json.
 * - Sentinel lives under <stanPath>/diff/.stan_no_changes.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { logArchiveWarnings, makeTarFilter } from './archive/util';
import { classifyForArchive } from './classifier';
import { ensureOutAndDiff, filterFiles, listFiles } from './fs';
type TarLike = {
  create: (
    opts: {
      file: string;
      cwd?: string;
      filter?: (path: string, stat: unknown) => boolean;
    },
    files: string[],
  ) => Promise<void>;
};
export type SnapshotUpdateMode = 'never' | 'createIfMissing' | 'replace';

const computeCurrentHashes = async (
  cwd: string,
  relFiles: string[],
): Promise<Record<string, string>> => {
  const current: Record<string, string> = {};
  for (const rel of relFiles) {
    const abs = resolve(cwd, rel);
    const buf = await readFile(abs);
    const h = createHash('sha256').update(buf).digest('hex');
    current[rel] = h;
  }
  return current;
};

const snapshotPathFor = (diffDir: string): string =>
  join(diffDir, '.archive.snapshot.json');

const sentinelPathFor = (diffDir: string): string =>
  join(diffDir, '.stan_no_changes');

/**
 * Compute (and optionally update) the snapshot file in <stanPath>/diff/.
 * Returns the absolute snapshot path.
 *
 * @param args - Object with:
 *   - cwd: Repo root.
 *   - stanPath: STAN workspace folder.
 *   - includes: Allow‑list globs (overrides excludes).
 *   - excludes: Deny‑list globs.
 * @returns Absolute path to the `.archive.snapshot.json` file.
 */
export const writeArchiveSnapshot = async ({
  cwd,
  stanPath,
  includes,
  excludes,
}: {
  cwd: string;
  stanPath: string;
  includes?: string[];
  excludes?: string[];
}): Promise<string> => {
  const { diffDir } = await ensureOutAndDiff(cwd, stanPath);

  const all = await listFiles(cwd);
  const filtered = await filterFiles(all, {
    cwd,
    stanPath,
    includeOutputDir: false,
    includes: includes ?? [],
    excludes: excludes ?? [],
  });

  const current = await computeCurrentHashes(cwd, filtered);
  const snapPath = snapshotPathFor(diffDir);
  await writeFile(snapPath, JSON.stringify(current, null, 2), 'utf8');
  return snapPath;
};

/**
 * Create a diff tar at <stanPath>/output/<baseName>.diff.tar.
 * - If snapshot exists: include only changed files.
 * - If no snapshot exists: include full file list (diff equals full archive).
 * - Snapshot update behavior is controlled by updateSnapshot.
 * - When includeOutputDirInDiff === true, also include the entire <stanPath>/output tree
 *   (excluding <stanPath>/diff and the two archive files) regardless of change list length.
 * - Always include <stanPath>/patch in the diff archive.
 *
 * @param args - Object with:
 *   - cwd: Repo root.
 *   - stanPath: STAN workspace folder.
 *   - baseName: Base archive name (e.g., `archive` -\> `archive.diff.tar`).
 *   - includes: Allow‑list globs (overrides excludes).
 *   - excludes: Deny‑list globs.
 *   - updateSnapshot: Controls when the snapshot file is replaced.
 *   - includeOutputDirInDiff: When true, include `stanPath/output` in the diff.
 * @returns `{ diffPath }` absolute path to the diff archive.
 */
export const createArchiveDiff = async ({
  cwd,
  stanPath,
  baseName,
  includes,
  excludes,
  updateSnapshot = 'createIfMissing',
  includeOutputDirInDiff = false,
}: {
  cwd: string;
  stanPath: string;
  baseName: string;
  includes?: string[];
  excludes?: string[];
  updateSnapshot?: SnapshotUpdateMode;
  includeOutputDirInDiff?: boolean;
}): Promise<{ diffPath: string }> => {
  const { outDir, diffDir } = await ensureOutAndDiff(cwd, stanPath);

  const all = await listFiles(cwd);
  const filtered = await filterFiles(all, {
    cwd,
    stanPath,
    includeOutputDir: false,
    includes: includes ?? [],
    excludes: excludes ?? [],
  });

  const current = await computeCurrentHashes(cwd, filtered);

  const snapPath = snapshotPathFor(diffDir);
  const hasPrev = existsSync(snapPath);
  const prev: Record<string, string> = hasPrev
    ? (JSON.parse(await readFile(snapPath, 'utf8')) as Record<string, string>)
    : {};

  const changedRaw: string[] = hasPrev
    ? filtered.filter((rel) => !prev[rel] || prev[rel] !== current[rel])
    : [...filtered];

  // Classify like the regular archive:
  // - exclude binaries
  // - flag large text (not excluded)
  const { textFiles, warningsBody } = await classifyForArchive(cwd, changedRaw);
  const changed = textFiles;

  logArchiveWarnings(warningsBody ?? '');

  const diffPath = join(outDir, `${baseName}.diff.tar`);
  const tar = (await import('tar')) as unknown as TarLike;
  if (includeOutputDirInDiff) {
    const files = Array.from(
      new Set([...changed, `${stanPath.replace(/\\/g, '/')}/output`]),
    );

    await tar.create(
      {
        file: diffPath,
        cwd,
        filter: makeTarFilter(stanPath),
      },
      files,
    );
  } else if (changed.length === 0) {
    const sentinel = sentinelPathFor(diffDir);
    await writeFile(sentinel, 'no changes', 'utf8');
    const files = [`${stanPath.replace(/\\/g, '/')}/diff/.stan_no_changes`];
    await tar.create({ file: diffPath, cwd }, files);
  } else {
    const files = Array.from(new Set([...changed]));
    await tar.create({ file: diffPath, cwd }, files);
  }

  if (updateSnapshot === 'replace') {
    await writeFile(snapPath, JSON.stringify(current, null, 2), 'utf8');
  } else if (updateSnapshot === 'createIfMissing' && !hasPrev) {
    await writeFile(snapPath, JSON.stringify(current, null, 2), 'utf8');
  }

  return { diffPath };
};
