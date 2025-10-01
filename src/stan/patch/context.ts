import path from 'node:path';

import { findConfigPathSync, loadConfig } from '@/stan/config';

import { makeStanDirs } from '../paths';

export const resolvePatchContext = async (
  cwd0: string,
): Promise<{
  cwd: string;
  stanPath: string;
  patchAbs: string;
  patchRel: string;
}> => {
  const cfgPath = findConfigPathSync(cwd0);
  const cwd = cfgPath ? path.dirname(cfgPath) : cwd0;

  let stanPath = '.stan';
  try {
    const cfg = await loadConfig(cwd);
    stanPath = cfg.stanPath;
  } catch {
    // default used
  }
  const dirs = makeStanDirs(cwd, stanPath);
  const patchAbs = path.join(dirs.patchAbs, '.patch');
  const patchRel = path.relative(cwd, patchAbs).replace(/\\/g, '/');
  return { cwd, stanPath, patchAbs, patchRel };
};
