// src/runner/init/service/write-config.ts
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

/** Serialize config to the target path, honoring existing extension when present. */
export const writeConfigToDisk = async (args: {
  cwd: string;
  existingPath?: string | null;
  base: Record<string, unknown>;
  dryRun?: boolean;
}): Promise<string> => {
  const { cwd, existingPath, base, dryRun } = args;
  const targetPath = existingPath ?? path.join(cwd, 'stan.config.yml');
  if (!dryRun) {
    if (existingPath && existingPath.endsWith('.json')) {
      const json = JSON.stringify(base, null, 2);
      await writeFile(targetPath, json, 'utf8');
    } else {
      const yml = YAML.stringify(base);
      await writeFile(targetPath, yml, 'utf8');
    }
  }
  return targetPath;
};
