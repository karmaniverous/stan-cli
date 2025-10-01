// src/stan/patch/format.test.ts
import { describe, expect, it } from 'vitest';

import { formatPatchFailure, type JsReason } from './format';
const makeOkMessage = (): string => {
  return [
    '## UPDATED: src/x.ts',
    '',
    '### Patch: src/x.ts',
    '```',
    'diff --git a/src/x.ts b/src/x.ts',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -1,1 +1,1 @@',
    '-old',
    '+new',
    '```',
    '',
    '## UPDATED: .stan/system/stan.todo.md',
    '',
    '### Patch: .stan/system/stan.todo.md',
    '```',
    'diff --git a/.stan/system/stan.todo.md b/.stan/system/stan.todo.md',
    '--- a/.stan/system/stan.todo.md',
    '+++ b/.stan/system/stan.todo.md',
    '@@ -1,1 +1,1 @@',
    '-before',
    '+after',
    '```',
    '',
    '## Commit Message',
    '```',
    'feat: sample',
    '',
    'When: 2025-08-28',
    'Why: test',
    'What changed:',
    '- src/x.ts',
    '- .stan/system/stan.todo.md',
    '```',
    '',
  ].join('\n');
};

describe('formatPatchFailure (unit coverage: downstream vs STAN; diff vs file-ops)', () => {
  it('downstream diff: unified diagnostics envelope (matches STAN style)', () => {
    const out = formatPatchFailure({
      context: 'downstream',
      kind: 'diff',
      targets: ['src/a.ts', 'src/b.ts'],
    });
    // Unified envelope with ID line for the first target and START/END markers.
    expect(out).toMatch(
      /The unified diff patch for file src\/a\.ts was invalid\./,
    );
    expect(out).toMatch(/START PATCH DIAGNOSTICS/);
    expect(out).toMatch(/END PATCH DIAGNOSTICS/);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('STAN diff: diagnostics envelope with verbatim git stderr when present', () => {
    const stderr = 'error: patch failed\nat foo:1';
    const out = formatPatchFailure({
      context: 'stan',
      kind: 'diff',
      targets: ['src/x.ts'],
      gitStderr: stderr,
    });
    expect(out).toMatch(
      /The unified diff patch for file src\/x\.ts was invalid\./,
    );
    expect(out).toMatch(/START PATCH DIAGNOSTICS/);
    expect(out).toContain(stderr);
    expect(out).toMatch(/END PATCH DIAGNOSTICS/);
  });

  it('STAN diff: when git stderr absent, include jsdiff reasons', () => {
    const js: JsReason[] = [
      { path: 'src/y.ts', reason: 'unable to place hunk(s)' },
      { path: 'src/z.ts', reason: 'target file not found' },
    ];
    const out = formatPatchFailure({
      context: 'stan',
      kind: 'diff',
      targets: ['src/y.ts'],
      gitStderr: '',
      jsReasons: js,
    });
    expect(out).toMatch(/START PATCH DIAGNOSTICS/);
    expect(out).toMatch(/jsdiff: src\/y\.ts: unable to place hunk/);
    expect(out).toMatch(/jsdiff: src\/z\.ts: target file not found/);
    expect(out).toMatch(/END PATCH DIAGNOSTICS/);
  });

  it('downstream file-ops: unified diagnostics envelope (matches STAN style)', () => {
    const block = ['### File Ops', 'mv a b', 'rm c'].join('\n');
    const out = formatPatchFailure({
      context: 'downstream',
      kind: 'file-ops',
      fileOpsBlock: block,
    });
    expect(out).toMatch(/^The File Ops patch failed\./m);
    expect(out).toMatch(/START PATCH DIAGNOSTICS/);
    expect(out).toMatch(/END PATCH DIAGNOSTICS/);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('STAN file-ops: diagnostics envelope with parser/exec lines', () => {
    const errors = [
      'file-ops failed: mv a b — destination exists',
      'file-ops failed: rm c — path does not exist',
    ];
    const out = formatPatchFailure({
      context: 'stan',
      kind: 'file-ops',
      fileOpsErrors: errors,
    });
    expect(out).toMatch(/^The File Ops patch failed\./);
    expect(out).toMatch(/START PATCH DIAGNOSTICS/);
    for (const e of errors) expect(out).toContain(e);
    expect(out).toMatch(/END PATCH DIAGNOSTICS/);
  });
});
