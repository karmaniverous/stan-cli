/** src/runner/overlay/anchors.reserved.integration.test.ts
 * Integration: anchors must not override reserved denials.
 * - Reserved: .git/**, <stanPath>/diff/**, <stanPath>/patch/**.
 * - Positive control: a normal anchored file (README.md) must be included.
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import {
  ensureOutputDir,
  writeArchiveSnapshot,
} from '@karmaniverous/stan-core';

const posix = (p: string): string => p.replace(/\\/g, '/');

describe('anchors vs reserved denials (integration)', () => {
  it('does not include reserved targets even when anchored; includes normal anchors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'stan-anchors-reserved-'));
    const stanPath = '.stan';
    // Ensure workspace dirs so snapshot has a home
    await ensureOutputDir(root, stanPath, true);

    // Create files:
    // - normal (should be included via anchors)
    // - reserved under .git, .stan/diff, .stan/patch (must never be included)
    const files: Array<{ rel: string; body?: string }> = [
      { rel: 'README.md', body: 'ok\n' },
      { rel: join('.git', 'KEEP.txt'), body: 'git\n' },
      { rel: join('.stan', 'diff', 'KEEP.txt'), body: 'diff\n' },
      { rel: join('.stan', 'patch', 'KEEP.txt'), body: 'patch\n' },
    ];

    for (const f of files) {
      const abs = join(root, f.rel);
      await mkdir(abs.substring(0, abs.lastIndexOf(sep)), {
        recursive: true,
      }).catch(() => void 0);
      await writeFile(abs, f.body ?? 'x\n', 'utf8');
    }

    // Anchors attempt to re-include all of them
    const anchors = files.map((f) => posix(f.rel));

    // Compute snapshot (selection only)
    const snapPath = await writeArchiveSnapshot({
      cwd: root,
      stanPath,
      includes: [], // rely on defaults + anchors
      excludes: [], // do not deny explicitly here
      anchors,
    });

    // Snapshot is a JSON object of { relPath: { hash/size/... } } (keys = selected files)
    const raw = await readFile(snapPath, 'utf8');
    const snap = JSON.parse(raw) as Record<string, unknown>;
    const keys = Object.keys(snap).map(posix);

    // Positive control: normal anchored file appears
    expect(keys).toContain('README.md');
    // Reserved denials: never appear even when anchored
    expect(keys).not.toContain('.git/KEEP.txt');
    expect(keys).not.toContain('.stan/diff/KEEP.txt');
    expect(keys).not.toContain('.stan/patch/KEEP.txt');
  });
});
