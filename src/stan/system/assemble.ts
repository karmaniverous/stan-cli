/* src/stan/system/assemble.ts
 * Assemble <stanPath>/system/parts/*.md into <stanPath>/system/stan.system.md.
 * Emits no console logs; callers decide what to print.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ensureDir } from 'fs-extra';

const headerFor = (stanPath: string): string =>
  `<!-- GENERATED: assembled from ${stanPath}/system/parts; edit parts and run \`npm run gen:system\` -->\n`;
const toLF = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

export type AssembleResult =
  | { target: string; action: 'written' }
  | { target: string; action: 'skipped-no-parts'; partsDir: string }
  | { target: string; action: 'skipped-no-md'; partsDir: string };

/**
 * Assemble parts into the monolith (no logs).
 * - Returns 'written' when created/updated,
 * - 'skipped-no-parts' when parts dir missing,
 * - 'skipped-no-md' when no .md files present.
 */
export const assembleSystemMonolith = async (
  cwd: string,
  stanPath: string,
): Promise<AssembleResult> => {
  const sysRoot = path.join(cwd, stanPath, 'system');
  const partsDir = path.join(sysRoot, 'parts');
  const target = path.join(sysRoot, 'stan.system.md');

  await ensureDir(sysRoot);

  if (!existsSync(partsDir)) {
    return { target, action: 'skipped-no-parts', partsDir };
  }

  const entries = await readdir(partsDir, { withFileTypes: true });
  const partFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (partFiles.length === 0) {
    return { target, action: 'skipped-no-md', partsDir };
  }

  const bodies: string[] = [];
  for (const name of partFiles) {
    const abs = path.join(partsDir, name);
    const body = toLF(await readFile(abs, 'utf8')).trimEnd();
    bodies.push(body);
  }

  const assembled = headerFor(stanPath) + bodies.join('\n\n') + '\n';
  await writeFile(target, assembled, 'utf8');
  return { target, action: 'written' };
};
