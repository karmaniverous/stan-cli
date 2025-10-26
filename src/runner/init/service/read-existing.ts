// src/runner/init/service/read-existing.ts
import { readFile } from 'node:fs/promises';

import YAML from 'yaml';

/** Read the existing stan.config.* body preserving key order; return {} on failure. */
export const readExistingConfig = async (
  existingPath: string | null | undefined,
): Promise<Record<string, unknown>> => {
  if (!existingPath) return {};
  try {
    const raw = await readFile(existingPath, 'utf8');
    const parsed: unknown = YAML.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};
