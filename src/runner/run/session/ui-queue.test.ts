import { describe, expect, it } from 'vitest';

import { queueUiRows } from './ui-queue';

describe('queueUiRows (archive kind)', () => {
  const mkUi = () => {
    const queued: Array<{ type: 'script' | 'archive'; value: string }> = [];
    return {
      queued,
      ui: {
        start() {},
        onPlan() {},
        onScriptQueued(key: string) {
          queued.push({ type: 'script', value: key });
        },
        onScriptStart() {},
        onScriptEnd() {},
        onArchiveQueued(kind: 'full' | 'diff' | 'meta') {
          queued.push({ type: 'archive', value: kind });
        },
        onArchiveStart() {},
        onArchiveEnd() {},
        onCancelled() {},
        installCancellation() {},
        stop() {},
      },
    };
  };

  it('queues meta (and skips diff) when requested', () => {
    const { ui, queued } = mkUi();
    const config = { scripts: { a: 'echo a' }, stanPath: '.stan' };

    const toRun = queueUiRows(ui, ['a'], config, true, {
      primaryArchiveKind: 'meta',
      skipDiff: true,
    });

    expect(toRun).toEqual(['a']);
    expect(queued).toEqual([
      { type: 'script', value: 'a' },
      { type: 'archive', value: 'meta' },
    ]);
  });

  it('queues full and diff by default', () => {
    const { ui, queued } = mkUi();
    const config = { scripts: { a: 'echo a' }, stanPath: '.stan' };

    queueUiRows(ui, ['a'], config, true);

    expect(queued).toEqual([
      { type: 'script', value: 'a' },
      { type: 'archive', value: 'full' },
      { type: 'archive', value: 'diff' },
    ]);
  });
});
