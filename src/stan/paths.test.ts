import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { stanDirs } from './paths';

const norm = (p: string) => p.replace(/\\+/g, '/');

describe('stanDirs', () => {
  it('computes common workspace paths', () => {
    const cwd = path.resolve('/repo');
    const stanPath = 'out';
    const d = stanDirs(cwd, stanPath);
    expect(norm(d.base)).toBe(norm(path.join(cwd, stanPath)));
    expect(norm(d.system)).toBe(norm(path.join(cwd, stanPath, 'system')));
    expect(norm(d.output)).toBe(norm(path.join(cwd, stanPath, 'output')));
    expect(norm(d.diff)).toBe(norm(path.join(cwd, stanPath, 'diff')));
    expect(norm(d.patch)).toBe(norm(path.join(cwd, stanPath, 'patch')));
    expect(norm(d.systemFile)).toBe(
      norm(path.join(cwd, stanPath, 'system', 'stan.system.md')),
    );
  });
});
