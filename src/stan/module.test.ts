import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getModuleRoot, getPackagedSystemPromptPath } from '@/stan/module';

describe('module root and packaged prompt resolution', () => {
  it('getPackagedSystemPromptPath returns null when missing and resolves when present', async () => {
    const root = getModuleRoot();
    // In very unusual environments this can be null; bail safely.
    expect(root && typeof root === 'string').toBe(true);
    if (!root) return;

    const distDir = path.join(root, 'dist');
    const promptPath = path.join(distDir, 'stan.system.md');

    // Ensure clean start
    await rm(promptPath, { force: true }).catch(() => {});

    // Absent -> null
    const before = getPackagedSystemPromptPath();
    expect(before).toBeNull();

    // Present -> returns the path
    await mkdir(distDir, { recursive: true });
    await writeFile(promptPath, '# prompt\n', 'utf8');
    const after = getPackagedSystemPromptPath();
    expect(typeof after).toBe('string');
    expect(after && after.endsWith(path.join('dist', 'stan.system.md'))).toBe(
      true,
    );

    // Cleanup (leave dist/ itself to avoid racing other tasks)
    await rm(promptPath, { force: true }).catch(() => {});
  });
});
