import { statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import YAML from 'yaml';

const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const readYaml = async (p: string): Promise<any> =>
  YAML.parse(await readFile(p, 'utf8'));
const readJson = async (p: string): Promise<any> =>
  JSON.parse(await readFile(p, 'utf8'));

export const resolveWorkspace = async (
  cwd: string,
  query: string,
): Promise<string | null> => {
  // 1. Directory check
  const dirCand = path.resolve(cwd, query);
  if (isDir(dirCand)) return dirCand;

  // 2. Package name search
  let patterns: string[] = [];
  const pnpmPath = path.join(cwd, 'pnpm-workspace.yaml');
  if (existsSync(pnpmPath)) {
    const y = await readYaml(pnpmPath);
    if (y && Array.isArray(y.packages)) patterns = y.packages;
  } else {
    const pkgPath = path.join(cwd, 'package.json');
    if (existsSync(pkgPath)) {
      const p = await readJson(pkgPath);
      if (Array.isArray(p.workspaces)) patterns = p.workspaces;
      else if (p.workspaces && Array.isArray(p.workspaces.packages))
        patterns = p.workspaces.packages;
    }
  }

  if (patterns.length === 0) return null;

  // Glob for package.json (excludes node_modules by default in fast-glob, but explicit ignore is safer)
  const search = patterns.map((p) =>
    path.join(p, 'package.json').replace(/\\/g, '/'),
  );
  const entries = await fg(search, {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });

  for (const ent of entries) {
    try {
      const pkg = await readJson(ent);
      if (pkg.name === query) {
        return path.dirname(ent);
      }
    } catch {
      /* ignore */
    }
  }

  return null;
};

export const switchToWorkspace = async (
  cwd: string,
  query: string,
): Promise<void> => {
  const target = await resolveWorkspace(cwd, query);
  if (!target) {
    throw new Error(
      `Could not find workspace or directory matching "${query}"`,
    );
  }
  process.chdir(target);
  console.log(`stan: switched context to ${path.relative(cwd, target) || '.'}`);
};
