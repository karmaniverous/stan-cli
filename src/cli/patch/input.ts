/** src/cli/patch/input.ts
 * Input acquisition helper (argument \> -f file \> clipboard/service path).
 */
import { readFile } from 'node:fs/promises';

export const readRawFromArgOrFile = async (
  inputMaybe?: string,
  fileMaybe?: unknown,
): Promise<{ raw: string; source: string }> => {
  if (typeof inputMaybe === 'string' && inputMaybe.length > 0) {
    return { raw: inputMaybe, source: 'argument' };
  }
  const file =
    typeof fileMaybe === 'string' && fileMaybe.trim().length
      ? fileMaybe.trim()
      : undefined;
  if (file) {
    const raw = await readFile(file, 'utf8');
    return { raw, source: `file "${file}"` };
  }
  // Last resort: empty input (service will try clipboard/default-file paths if needed)
  return { raw: '', source: 'clipboard' };
};
