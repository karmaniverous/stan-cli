// src/stan/run/session/order-file.ts
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
+ * Ensure the optional order.txt file (tests).
+ *
+ * @param shouldWrite - When true, writes/clears the file.
 * @param outAbs - Absolute path to <stanPath>/output.
 * @param keep - When true, do not clear the order file on entry.
+ * @returns order file path when created/enabled; otherwise undefined.
+ */
export const ensureOrderFile = async (
  shouldWrite: boolean,
  outAbs: string,
  keep: boolean,
): Promise<string | undefined> => {
  if (!shouldWrite) return undefined;
  const p = resolve(outAbs, 'order.txt');
  if (!keep) await writeFile(p, '', 'utf8');
  return p;
};
