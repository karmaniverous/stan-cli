/* src/stan/imports/stage.ts
 * Stage external artifacts under <stanPath>/imports/<label>/... just before archiving.
 * - Labels: allow A–Z a–z 0–9 @ / _ - ; forbid “..”; sanitize other chars to "_".
 * - Globs: resolve with fast-glob; allow absolute/../ patterns; include dot files.
 * - Mapping: dest = <stanPath>/imports/<label>/<tail>; tail = path relative to glob-parent(pattern).
 * - Logging: one concise line per label: "stan: import <label> -> N file(s)".
 */
import { copyFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import { ensureDir } from 'fs-extra';
import globParent from 'glob-parent';

import { makeStanDirs } from '@/stan/paths';

const isSafeSegment = (seg: string): boolean => seg !== '' && seg !== '..';
const sanitizeSegment = (seg: string): string =>
  seg
    .replace(/[^A-Za-z0-9@/_-]/g, '_')
    .replace(/\/{2,}/g, '/')
    .trim();

/** Sanitize a label into a nested path (allow "\@scope/pkg"), or return null if invalid. */
const sanitizeLabel = (label: string): string | null => {
  if (typeof label !== 'string' || !label.trim()) return null;
  const raw = sanitizeSegment(label.trim());
  const parts = raw.split('/').filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  for (const p of parts) {
    if (!isSafeSegment(p)) return null;
  }
  return parts.join('/');
};

/** Return true when a file exists and is a regular file. */
const isFile = async (abs: string): Promise<boolean> => {
  try {
    const s = await stat(abs);
    return s.isFile();
  } catch {
    return false;
  }
};

export type ImportsMap = Record<string, string[]>;

/**
 * Prepare imports under <stanPath>/imports/<label>/... for archiving.
 * - Cleans each label directory prior to staging.
 * - Copies only files (skips directories); unreadable files are skipped best‑effort.
 *
 * @param args - Object containing cwd, stanPath, and map of label -\> patterns.
 */
export const prepareImports = async (args: {
  cwd: string;
  stanPath: string;
  map?: ImportsMap | null;
}): Promise<void> => {
  const { cwd, stanPath, map } = args;
  if (!map || typeof map !== 'object') return;
  const dirs = makeStanDirs(cwd, stanPath);
  const root = path.join(dirs.rootAbs, 'imports');
  await ensureDir(root);

  // Process labels deterministically (stable order)
  const labels = Object.keys(map).sort();
  for (const labelRaw of labels) {
    const globs = map[labelRaw] ?? [];
    if (!Array.isArray(globs) || globs.length === 0) continue;
    const label = sanitizeLabel(labelRaw);
    if (!label) continue; // skip invalid labels
    const destRoot = path.join(root, label);
    // Clean per-label directory
    await rm(destRoot, { recursive: true, force: true }).catch(() => {});
    await ensureDir(destRoot).catch(() => {});

    const staged: string[] = [];
    for (const patternRaw of globs) {
      const pattern = String(patternRaw ?? '').trim();
      if (!pattern) continue;
      // Compute static parent for tail mapping (best-effort)
      const parent = globParent(pattern.replace(/\\/g, '/'));
      try {
        // Resolve absolute file paths for matches; allow absolute & relative inputs
        const matches = await fg(pattern, {
          cwd,
          absolute: true,
          dot: true,
          onlyFiles: false,
          followSymbolicLinks: false,
        });
        for (const abs of matches) {
          if (!(await isFile(abs))) continue;
          // Tail is path relative to the static part of the glob
          const tail = path
            .relative(
              path.isAbsolute(parent) ? parent : path.resolve(cwd, parent),
              abs,
            )
            .replace(/\\/g, '/');
          if (!tail || tail.includes('..')) continue;
          const dest = path.join(destRoot, tail);
          await ensureDir(path.dirname(dest)).catch(() => {});
          try {
            await copyFile(abs, dest);
            staged.push(dest);
          } catch {
            // best‑effort skip
          }
        }
      } catch {
        // best‑effort continue with other patterns
      }
    }
    // Summary log for this label
    try {
      console.log(
        `stan: import ${label} -> ${staged.length.toString()} file(s)`,
      );
    } catch {
      /* ignore */
    }
  }
};
