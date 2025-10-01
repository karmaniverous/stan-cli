/* src/stan/archive.ts
 * Create a project archive under the output directory.
 * REQUIREMENTS (updated):
 * - Create <stanPath>/output/archive.tar from project root, excluding node_modules/.git and (by default) stanPath.
 * - Options:
 *   - includeOutputDir?: when true, include the <stanPath>/output directory contents while excluding stanPath/diff and the archive files.
 *   - fileName?: override base name (must end with .tar).
 * - Honor includes/excludes from config (globs supported; includes override excludes).
 * - Return the absolute path to the created tarball.
 * - Maintain previous-archive copy at <stanPath>/diff/archive.prev.tar.
 * - UPDATED: Do NOT write archive warnings to a file; log them to the console instead.
 */
import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ARCHIVE_PREV_TAR } from './archive/constants';
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

/** Options to control archive creation. */
export type CreateArchiveOptions = {
  /** When true, include the `stanPath/output` directory inside the archive. */
  includeOutputDir?: boolean;
  /**
   * Archive file name. If provided without `.tar`, the suffix is added.
   * Written to `stanPath/output/<fileName>`.
   */
  fileName?: string;
  /** Allow‑list globs; when provided, overrides excludes. */
  includes?: string[];
  /**
   * Deny‑list globs. Defaults include `.git`, `node_modules`, and STAN
   * workspace rules. These are applied only when `includes` is empty.
   */
  excludes?: string[];
};

/** Create `stanPath/output/archive.tar` (or custom file name) from the repo root. */
export const createArchive = async (
  cwd: string,
  stanPath: string,
  options: CreateArchiveOptions = {},
): Promise<string> => {
  const {
    includeOutputDir = false,
    fileName: rawFileName,
    includes = [],
    excludes = [],
  } = options;

  let fileName = rawFileName ?? 'archive.tar';
  if (!fileName.endsWith('.tar')) fileName += '.tar';

  const { outDir, diffDir } = await ensureOutAndDiff(cwd, stanPath);

  const all = await listFiles(cwd);
  const files = await filterFiles(all, {
    cwd,
    stanPath,
    includeOutputDir,
    includes,
    excludes,
  });

  const archivePath = resolve(outDir, fileName);
  const prevPath = resolve(diffDir, ARCHIVE_PREV_TAR);

  // If an old archive exists in output, copy it to diff before overwriting.
  if (existsSync(archivePath)) {
    try {
      await copyFile(archivePath, prevPath);
    } catch {
      // ignore copy errors
    }
  }

  // Classify prior to archiving:
  // - exclude binaries
  // - flag large text (not excluded)
  const { textFiles, warningsBody } = await classifyForArchive(cwd, files);
  const filesForArchive = textFiles;

  logArchiveWarnings(warningsBody ?? '');

  const tar = (await import('tar')) as unknown as TarLike;

  if (includeOutputDir) {
    // Force-include <stanPath>/output and exclude <stanPath>/diff and archive files.
    const filesToPack = Array.from(
      new Set([...filesForArchive, `${stanPath.replace(/\\/g, '/')}/output`]),
    );

    await tar.create(
      {
        file: archivePath,
        cwd,
        filter: makeTarFilter(stanPath),
      },
      filesToPack,
    );
  } else {
    // No refactors directory is created anymore; no special-case filter needed for it.
    await tar.create(
      {
        file: archivePath,
        cwd,
        filter: makeTarFilter(stanPath),
      },
      filesForArchive,
    );
  }
  // Ensure prev exists on first run.
  if (!existsSync(prevPath)) {
    try {
      await copyFile(archivePath, prevPath);
    } catch {
      // ignore copy errors
    }
  }

  return archivePath;
};
