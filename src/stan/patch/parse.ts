// src/stan/patch/parse.ts
import { parsePatch } from 'diff';

const stripAB = (p?: string | null): { path?: string; hadAB: boolean } => {
  if (!p) return { path: undefined, hadAB: false };
  const hadAB = /^a\/|^b\//.test(p);
  const path = p.replace(/^a\//, '').replace(/^b\//, '').trim();
  return { path: path.length ? path : undefined, hadAB };
};

export type ParsedFilePatch = {
  oldPath?: string;
  newPath?: string;
  hasABPrefixes: boolean;
  hunks: number;
};

export type ParsedDiffInfo = {
  files: ParsedFilePatch[];
  /** true if any file indicates a/ b/ prefixes in headers */
  hasABPrefixes: boolean;
  /** best-effort strip order to try (p1 preferred when AB prefixes present) */
  stripCandidates: number[];
};

/** Parse a cleaned unified diff and derive strip candidates (p1 preferred when a/ b/ prefixes present). */
export const parseUnifiedDiff = (cleaned: string): ParsedDiffInfo => {
  const patches = parsePatch(cleaned);
  const files: ParsedFilePatch[] = patches.map((p) => {
    const a = stripAB(p.oldFileName ?? null);
    const b = stripAB(p.newFileName ?? null);
    return {
      oldPath: a.path,
      newPath: b.path,
      hasABPrefixes: a.hadAB || b.hadAB,
      hunks: Array.isArray(p.hunks) ? p.hunks.length : 0,
    };
  });

  const anyAB = files.some((f) => f.hasABPrefixes);
  const stripCandidates = anyAB ? [1, 0] : [0, 1];

  return {
    files,
    hasABPrefixes: anyAB,
    stripCandidates,
  };
};

export type FileDiagnostic = {
  file: string;
  causes: string[];
  details: string[];
};

/** Basic, heuristic diagnostics for FEEDBACK (non-fuzzy by design). */
export const diagnosePatch = (info: ParsedDiffInfo): FileDiagnostic[] => {
  return info.files.map((f) => {
    const file = f.newPath ?? f.oldPath ?? '(unknown)';
    const causes: string[] = [];
    if (!f.hasABPrefixes) causes.push('missing a/b prefixes');
    if (f.hunks > 0) causes.push('may require --recount (context drift)');
    const details: string[] = [`hunks: ${f.hunks.toString()}`];
    return { file, causes, details };
  });
};
