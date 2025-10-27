/* src/stan/run/prompt.ts
 * System prompt resolution and temporary materialization for archiving.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CORE_VERSION } from '@karmaniverous/stan-core';

// Robust core prompt resolution (engine helper + fallback for global CLI + nested core)
import {
  getCliPackagedSystemPromptPath,
  resolveCorePromptPath,
} from '@/runner/prompt/resolve';

export type PromptChoice = string;

export type ResolvedPrompt = {
  /** absolute path to the resolved source file */
  abs: string;
  /** display string for plan header */
  display: string;
  /** where the source came from */
  kind: 'local' | 'core' | 'path';
};

const systemRel = (stanPath: string) =>
  path.join(stanPath, 'system', 'stan.system.md');

const readBytes = async (abs: string): Promise<Buffer> => {
  const b = await readFile(abs);
  return Buffer.from(b);
};

/** Resolve the system prompt source based on the user's choice (auto|local|core|path). */
export const resolvePromptSource = (
  cwd: string,
  stanPath: string,
  choice: PromptChoice,
): ResolvedPrompt => {
  const localAbs = path.join(cwd, systemRel(stanPath));
  const coreAbs = resolveCorePromptPath();

  if (choice === 'local') {
    if (!existsSync(localAbs)) {
      throw new Error(
        `system prompt not found at ${path
          .join(stanPath, 'system', 'stan.system.md')
          .replace(/\\/g, '/')}`,
      );
    }
    return {
      abs: localAbs,
      display: path
        .join(stanPath, 'system', 'stan.system.md')
        .replace(/\\/g, '/'),
      kind: 'local',
    };
  }

  if (choice === 'core') {
    if (!coreAbs || !existsSync(coreAbs)) {
      throw new Error(
        'packaged system prompt not found in @karmaniverous/stan-core',
      );
    }
    return {
      abs: coreAbs,
      display: `@karmaniverous/stan-core@${CORE_VERSION}`,
      kind: 'core',
    };
  }

  if (choice === 'auto') {
    if (existsSync(localAbs)) {
      return {
        abs: localAbs,
        display: path
          .join(stanPath, 'system', 'stan.system.md')
          .replace(/\\/g, '/'),
        kind: 'local',
      };
    }
    if (coreAbs && existsSync(coreAbs)) {
      return {
        abs: coreAbs,
        display: `@karmaniverous/stan-core@${CORE_VERSION}`,
        kind: 'core',
      };
    }
    // Last-ditch: use CLI's packaged prompt (treated as a plain 'path' source).
    try {
      const cliAbs = getCliPackagedSystemPromptPath();
      if (cliAbs && existsSync(cliAbs)) {
        return {
          abs: cliAbs,
          display: cliAbs.replace(/\\/g, '/'),
          kind: 'path',
        };
      }
    } catch {
      /* ignore */
    }
    throw new Error(
      'unable to resolve system prompt (auto: local and core unavailable)',
    );
  }

  // treat any other string as a path (absolute or repo-relative)
  const pathAbs = path.isAbsolute(choice) ? choice : path.join(cwd, choice);
  if (!existsSync(pathAbs)) {
    throw new Error(
      `system prompt not found at ${pathAbs.replace(/\\/g, '/')}`,
    );
  }
  return {
    abs: pathAbs,
    display: pathAbs.replace(/\\/g, '/'),
    kind: 'path',
  };
};

/** Write the chosen prompt under <stanPath>/system/stan.system.md if needed and return a restore() to revert afterward. */
export const preparePromptForArchive = async (
  cwd: string,
  stanPath: string,
  resolved: ResolvedPrompt,
): Promise<{ changed: boolean; restore: () => Promise<void> }> => {
  const dest = path.join(cwd, systemRel(stanPath));
  const destDir = path.dirname(dest);
  const existed = existsSync(dest);
  let original: Buffer | null = null;

  if (existed) {
    try {
      original = await readBytes(dest);
    } catch {
      original = null;
    }
  }

  const desired = await readBytes(resolved.abs);
  const same =
    existed &&
    original !== null &&
    original.length === desired.length &&
    original.equals(desired);
  if (!same) {
    await mkdir(destDir, { recursive: true });
    await writeFile(dest, desired);
  }

  return {
    changed: !same,
    restore: async () => {
      if (!same) {
        try {
          if (existed && original !== null) await writeFile(dest, original);
          else await rm(dest, { force: true });
        } catch {
          /* ignore */
        }
      }
    },
  };
};
