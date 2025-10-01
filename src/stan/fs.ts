/** Shared filesystem helpers for STAN archiving & diffing.
 * See <stanPath>/system/stan.project.md for global & cross‑cutting requirements.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { ensureDir } from 'fs-extra';
import ignoreFactory from 'ignore';
import picomatch from 'picomatch';

import { isReservedWorkspacePath, isUnder } from './fs/reserved';
import { makeStanDirs } from './paths';

/**
 * Recursively enumerate files under `root`, returning POSIX-style
 * relative paths (`/` separators, no leading `./`). *
 * @param root - Absolute directory to walk.
 */
export const listFiles = async (root: string): Promise<string[]> => {
  const out: string[] = [];
  const stack: string[] = ['.'];
  while (stack.length) {
    const rel = stack.pop() as string;
    const abs = resolve(root, rel);
    const entries = await readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel === '.' ? e.name : join(rel, e.name);
      if (e.isDirectory()) stack.push(childRel);
      else out.push(childRel.replace(/\\/g, '/'));
    }
  }
  return out;
};

/** Build an "ignore" instance from .gitignore (full pattern semantics). */
const buildIgnoreFromGitignore = async (
  cwd: string,
): Promise<ReturnType<typeof ignoreFactory> | null> => {
  const p = resolve(cwd, '.gitignore');
  if (!existsSync(p)) return null;
  try {
    const raw = await readFile(p, 'utf8');
    const ig = ignoreFactory();
    ig.add(raw);
    return ig;
  } catch {
    return null;
  }
};

const matchesPrefix = (f: string, p: string): boolean => {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return f === norm || f.startsWith(norm + '/');
};

const hasGlob = (p: string): boolean =>
  /[*?[\]{}()!]/.test(p) || p.includes('**');

type Matcher = (f: string) => boolean;

const toMatcher = (pattern: string): Matcher => {
  const pat = pattern
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
  if (!hasGlob(pat)) {
    if (!pat) return () => false;
    return (f) => matchesPrefix(f, pat);
  }
  const isMatch = picomatch(pat, { dot: true });
  return (f) => isMatch(f);
};

/**
 * Detect directories (at any depth) that contain their own package.json
 * (monorepo sub‑packages). Skips the repo root, node_modules/.git, and stanPath.
 */
const detectSubpackageDirs = (files: string[], stanRel: string): string[] => {
  const out = new Set<string>();
  for (const p of files) {
    if (p === 'package.json') continue; // repo root
    if (!p.endsWith('/package.json')) continue;
    const dir = p.slice(0, -'/package.json'.length);
    if (dir.startsWith('node_modules/') || dir.startsWith('.git/')) continue;
    if (dir === stanRel || dir.startsWith(`${stanRel}/`)) continue;
    if (dir.length > 0) out.add(dir);
  }
  return Array.from(out);
};

export type FilterOptions = {
  cwd: string;
  stanPath: string;
  includeOutputDir: boolean;
  includes?: string[];
  excludes?: string[];
};

/**
 * Filter a list of repo-relative paths according to:
 * - Base selection:
 *   - `.gitignore` semantics,
 *   - default denials (node_modules, .git),
 *   - user `excludes` (deny‑list globs),
 *   - STAN workspace rules (always exclude `stanPath/diff`; optionally exclude
 *     `stanPath/output` unless `includeOutputDir` is true).
 * - `includes` (allow‑list globs) — ADDITIVE augment with precedence:
 *   - When provided, matched files are ADDED to the base selection even if
 *     they would otherwise be excluded by `.gitignore` or default denials.
 *   - Config `excludes` take precedence over `includes` (i.e., explicit
 *     excludes always win).
 *   - Reserved exclusions still apply: `stanPath/diff` is always excluded;
 *     `stanPath/output` is excluded when `includeOutputDir` is false.
 *
 * Paths are compared using POSIX separators.
 *
 * @param files - Repo‑relative paths to consider.
 * @param options - See {@link FilterOptions}.
 * @returns Filtered list to include in archives/snapshots.
 */
export const filterFiles = async (
  files: string[],
  {
    cwd,
    stanPath,
    includeOutputDir,
    includes = [],
    excludes = [],
  }: FilterOptions,
): Promise<string[]> => {
  const stanRel = stanPath.replace(/\\/g, '/');
  // Default sub‑package exclusion: any directory that contains its own package.json
  const subpkgDirs = detectSubpackageDirs(files, stanRel);

  const ig = await buildIgnoreFromGitignore(cwd);

  // Deny list used to compute base selection
  const denyMatchers: Matcher[] = [
    // default denials by prefix
    (f: string) => matchesPrefix(f, 'node_modules'),
    (f: string) => matchesPrefix(f, '.git'),
    // .gitignore (full semantics via "ignore")
    ...(ig ? [(f: string) => ig.ignores(f)] : []),
    // user excludes (glob or prefix)
    ...excludes.map(toMatcher),
    // default: exclude nested sub‑packages by prefix
    ...subpkgDirs.map((d) => (f: string) => matchesPrefix(f, d)),
    // Reserved workspace paths (diff/patch) are always excluded by policy.
    (f: string) => isReservedWorkspacePath(stanRel, f),
  ];

  if (!includeOutputDir) {
    denyMatchers.push((f) => isUnder(`${stanRel}/output`, f));
  }

  // Base selection (deny list applied)
  const base = files.filter((f) => !denyMatchers.some((m) => m(f)));

  // Additive includes: union with base, but still respect reserved exclusions
  if (includes.length > 0) {
    const allowMatchers: Matcher[] = includes.map(toMatcher);
    const reserved: Matcher[] = [
      // Still reserve-exclude patch/diff even if explicitly included.
      (f) => isReservedWorkspacePath(stanRel, f),
      ...(includeOutputDir
        ? []
        : [(f: string) => isUnder(`${stanRel}/output`, f)]),
    ];
    // Build union: start from base, add includes (even if gitignored/default-denied)
    const inUnion = new Set<string>(base);
    for (const f of files) if (allowMatchers.some((m) => m(f))) inUnion.add(f);
    // Excludes take precedence over includes: drop anything matching user excludes.
    const excludesMatchers: Matcher[] = excludes.map(toMatcher);
    return files.filter(
      (f) =>
        inUnion.has(f) &&
        !reserved.some((m) => m(f)) &&
        !excludesMatchers.some((m) => m(f)),
    );
  }

  return base;
};
/**
 * Ensure `<stanPath>` workspace exists (root/output/diff/patch).
 * Returns the resolved directory set.
 */
export const ensureStanWorkspace = async (
  cwd: string,
  stanPath: string,
): Promise<{
  rootAbs: string;
  outputAbs: string;
  diffAbs: string;
  patchAbs: string;
}> => {
  const dirs = makeStanDirs(cwd, stanPath);
  await ensureDir(dirs.rootAbs);
  await ensureDir(dirs.outputAbs);
  await ensureDir(dirs.diffAbs);
  // Ensure patch workspace exists (archives exclude it by policy)
  await ensureDir(dirs.patchAbs);
  return {
    rootAbs: dirs.rootAbs,
    outputAbs: dirs.outputAbs,
    diffAbs: dirs.diffAbs,
    patchAbs: dirs.patchAbs,
  };
};

/** Back-compat: ensureOutAndDiff returns just output/diff absolute paths. */
export const ensureOutAndDiff = async (
  cwd: string,
  stanPath: string,
): Promise<{ outDir: string; diffDir: string }> => {
  const w = await ensureStanWorkspace(cwd, stanPath);
  return { outDir: w.outputAbs, diffDir: w.diffAbs };
};
