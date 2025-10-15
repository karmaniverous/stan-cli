// src/stan/patch/input.ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import clipboardy from 'clipboardy';

const readFromFile = async (cwd: string, relOrAbs: string): Promise<string> => {
  const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(cwd, relOrAbs);
  return readFile(abs, 'utf8');
};

export type ReadPatchOptions = {
  file?: string | boolean;
  defaultFile?: string;
  noFile?: boolean;
};

export const readPatchSource = async (
  cwd: string,
  inputMaybe: string | undefined,
  opts: ReadPatchOptions,
): Promise<{ source: string; raw: string }> => {
  // Argument content wins
  if (typeof inputMaybe === 'string' && inputMaybe.trim().length > 0) {
    return { source: 'argument', raw: inputMaybe };
  }
  // -f <file>
  if (typeof opts.file === 'string' && opts.file.trim().length > 0) {
    const raw = await readFromFile(cwd, opts.file.trim());
    return { source: `file "${opts.file.trim()}"`, raw };
  }
  // -f (no filename)
  if (opts.file === true) {
    if (
      !opts.noFile &&
      typeof opts.defaultFile === 'string' &&
      opts.defaultFile.trim().length
    ) {
      const raw = await readFromFile(cwd, opts.defaultFile.trim());
      return { source: `file "${opts.defaultFile.trim()}"`, raw };
    }
    const raw = await clipboardy.read();
    return { source: 'clipboard', raw };
  }
  // defaultFile (without -f)
  if (
    !opts.noFile &&
    typeof opts.defaultFile === 'string' &&
    opts.defaultFile.trim().length
  ) {
    const raw = await readFromFile(cwd, opts.defaultFile.trim());
    return { source: `file "${opts.defaultFile.trim()}"`, raw };
  }
  // Clipboard fallback
  const raw = await clipboardy.read();
  return { source: 'clipboard', raw };
};
