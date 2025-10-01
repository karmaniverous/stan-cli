/** src/stan/classifier.ts
 * Archive-time classifier:
 * - Exclude binary files from the archive.
 * - Flag large text (by size and/or LOC) without excluding it.
 * - Generate a warnings body for <stanPath>/output/archive.warnings.txt.
 */
import { open, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const LARGE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB
const LARGE_LOC = 3000;

const toPosix = (p: string): string => p.replace(/\\/g, '/');

/**
 * Fast, robust binary detector: read the first few KB and
 * treat the file as binary if it contains any NUL (0x00) byte.
 * This avoids callback-based detection and eliminates test hangs.
 */
const isLikelyBinary = async (abs: string): Promise<boolean> => {
  try {
    const fh = await open(abs, 'r');
    try {
      const buf = Buffer.allocUnsafe(8192);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      for (let i = 0; i < bytesRead; i += 1) {
        if (buf[i] === 0) return true;
      }
      return false;
    } finally {
      await fh.close().catch(() => void 0);
    }
  } catch {
    // If we cannot open/read, classify as text to avoid over-exclusion
    return false;
  }
};

const countLines = (body: string): number => {
  // Normalize to LF for counting; preserve semantics for callers
  const norm = body.replace(/\r\n/g, '\n');
  if (norm.length === 0) return 0;
  return norm.split('\n').length;
};

export type ArchiveClassification = {
  /** Relative paths to include in the archive (non-binary). */
  textFiles: string[];
  /** Relative paths that were excluded because they are binary. */
  excludedBinaries: Array<{ path: string; size: number }>;
  /** Large text files (flagged, not excluded). */
  largeText: Array<{ path: string; size: number; loc?: number }>;
  /** Ready-to-write body for <stanPath>/output/archive.warnings.txt. */
  warningsBody: string;
};

/** Classify files for archiving and build warnings body. */
export const classifyForArchive = async (
  cwd: string,
  relFiles: string[],
): Promise<ArchiveClassification> => {
  const textFiles: string[] = [];
  const excludedBinaries: Array<{ path: string; size: number }> = [];
  const largeText: Array<{ path: string; size: number; loc?: number }> = [];

  await Promise.all(
    relFiles.map(async (rel) => {
      const posixRel = toPosix(rel);
      const abs = resolve(cwd, rel);
      let s: { size: number } | null = null;
      try {
        s = await stat(abs);
      } catch {
        // Skip paths we cannot stat
        return;
      }
      const size = s?.size ?? 0;

      // Binary?
      let bin = false;
      try {
        bin = await isLikelyBinary(abs);
      } catch {
        bin = false;
      }
      if (bin) {
        excludedBinaries.push({ path: posixRel, size });
        return;
      }

      // Text — keep, and flag if large by size/LOC
      textFiles.push(posixRel);
      let loc: number | undefined;
      try {
        // Only read file if size heuristic alone didn't trigger the flag,
        // or if size is reasonably bounded.
        if (size <= LARGE_SIZE_BYTES || size < 5 * LARGE_SIZE_BYTES) {
          const body = await readFile(abs, 'utf8');
          loc = countLines(body);
        }
      } catch {
        // ignore read errors; LOC remains undefined
      }
      const largeBySize = size > LARGE_SIZE_BYTES;
      const largeByLoc = typeof loc === 'number' && loc > LARGE_LOC;
      if (largeBySize || largeByLoc) {
        largeText.push({ path: posixRel, size, loc });
      }
    }),
  );

  // Build warnings body
  const lines: string[] = [];
  if (excludedBinaries.length > 0) {
    lines.push(
      `Binary files excluded from archive (${excludedBinaries.length.toString()}):`,
    );
    for (const b of excludedBinaries) {
      lines.push(`  - ${b.path}  (${b.size.toString()} bytes)`);
    }
    lines.push('');
  }
  if (largeText.length > 0) {
    lines.push(
      `Large text files (included; consider excludes if unwanted) (${largeText.length.toString()}):`,
    );
    for (const t of largeText) {
      const parts = [`  - ${t.path}`, `(${t.size.toString()} bytes)`];
      if (typeof t.loc === 'number') parts.push(`${t.loc.toString()} LOC`);
      lines.push(parts.join(' '));
    }
    lines.push('');
    lines.push(
      `Thresholds: size > ${LARGE_SIZE_BYTES.toString()} bytes or LOC > ${LARGE_LOC.toString()}`,
    );
  }
  if (lines.length === 0) {
    lines.push('No archive warnings.');
  }
  const warningsBody = lines.join('\n') + (lines.length ? '\n' : '');

  return { textFiles, excludedBinaries, largeText, warningsBody };
};
