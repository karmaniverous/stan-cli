import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assembleSystemMonolith } from '../src/stan/system/assemble';
import { findConfigPathSync, loadConfig } from '../src/stan/config';

/**
 * Assemble <stanPath>/system/parts/*.md (sorted) into <stanPath>/system/stan.system.md.
 * No‑op if the parts directory does not exist or contains no .md files.
 *
 * @returns Absolute path to the target monolith (whether written this run or not).
 */
export const assembleSystemPrompt = async (cwd: string): Promise<string> => {
  // Reuse centralized config discovery to avoid drift.
  const cfgPath = findConfigPathSync(cwd);
  const root = cfgPath ? path.dirname(cfgPath) : path.resolve(cwd);
  let stanPath = '.stan';
  try {
    const cfg = await loadConfig(root);
    stanPath =
      typeof cfg.stanPath === 'string' && cfg.stanPath.trim().length
        ? cfg.stanPath.trim()
        : '.stan';
  } catch {
    // best‑effort; keep fallback
    stanPath = '.stan';
  }

  const sysRoot = path.join(root, stanPath, 'system');
  const partsDir = path.join(sysRoot, 'parts');
  const target = path.join(sysRoot, 'stan.system.md');

  const res = await assembleSystemMonolith(root, stanPath);
  if (res.action === 'skipped-no-parts') {
    const rel = path.relative(root, res.partsDir).replace(/\\/g, '/');
    console.log(`stan: gen-system: skipped (no parts at ${rel})`);
    return res.target;
  }
  if (res.action === 'skipped-no-md') {
    const rel = path.relative(root, partsDir).replace(/\\/g, '/');
    console.log(
      `stan: gen-system: no *.md parts found in ${rel}; leaving monolith as-is`,
    );
    return res.target;
  }
  const rel = path.relative(root, res.target).replace(/\\/g, '/');
  console.log(`stan: gen-system -> ${rel}`);
  return res.target;
};
const main = async (): Promise<void> => {
  try {
    await assembleSystemPrompt(process.cwd());
  } catch (e) {
    // Best-effort; print concise error for CI logs
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`stan: gen-system failed: ${msg}`);
    process.exitCode = 1;
  }
};

// Execute only when invoked directly (e.g., `tsx gen-system.ts`)
const thisHref = pathToFileURL(path.resolve('gen-system.ts')).href;
if (import.meta.url === thisHref) {
  void main();
}
