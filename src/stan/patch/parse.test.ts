import { describe, expect, it } from 'vitest';

import { diagnosePatch, parseUnifiedDiff } from './parse';

describe('parseUnifiedDiff (strip candidates and diagnostics)', () => {
  it('detects a/ b/ prefixes and prefers p1', () => {
    const diff = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    const info = parseUnifiedDiff(diff);
    expect(info.hasABPrefixes).toBe(true);
    expect(info.stripCandidates).toEqual([1, 0]);
    expect(info.files.length).toBe(1);

    const diags = diagnosePatch(info);
    expect(diags[0].file).toBe('a.txt');
    expect(diags[0].causes).toContain('may require --recount (context drift)');
  });

  it('handles diffs without a/ b/ prefixes and prefers p0', () => {
    const diff = [
      '--- foo.txt',
      '+++ foo.txt',
      '@@ -1,1 +1,1 @@',
      '-hello',
      '+hello world',
      '',
    ].join('\n');

    const info = parseUnifiedDiff(diff);
    expect(info.hasABPrefixes).toBe(false);
    expect(info.stripCandidates).toEqual([0, 1]);
    expect(info.files.length).toBe(1);

    const diags = diagnosePatch(info);
    expect(diags[0].file).toBe('foo.txt');
    expect(diags[0].causes).toContain('missing a/b prefixes');
  });
});
