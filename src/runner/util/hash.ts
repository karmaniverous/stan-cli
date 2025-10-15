/* src/stan/util/hash.ts
 * SHA-256 hashing helper for file paths.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Compute the SHA-256 hash (hex) of a file's bytes.
 */
export const sha256File = async (abs: string): Promise<string> => {
  return createHash('sha256')
    .update(await readFile(abs))
    .digest('hex');
};
