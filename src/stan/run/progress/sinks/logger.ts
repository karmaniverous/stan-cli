/* src/stan/run/progress/sinks/logger.ts */

import { label } from '@/stan/run/labels';
import type { ProgressModel } from '@/stan/run/progress/model';
import type { RowMeta, ScriptState } from '@/stan/run/types';
import { relOut } from '@/stan/run/util/path';

export class LoggerSink {
  private unsubscribe?: () => void;

  constructor(
    private readonly model: ProgressModel,
    private readonly cwd: string,
  ) {}

  start(): void {
    this.unsubscribe = this.model.subscribe((e) =>
      this.onUpdate(e.meta, e.state),
    );
  }

  stop(): void {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = undefined;
  }

  private onUpdate(meta: RowMeta, state: ScriptState): void {
    const item = meta.item;
    const kind =
      meta.type === 'archive'
        ? item === 'diff'
          ? 'archive (diff)'
          : 'archive'
        : item;
    if (state.kind === 'waiting') {
      console.log(`stan: ${label('waiting')} "${kind}"`);
      return;
    }
    if (state.kind === 'running') {
      console.log(`stan: ${label('run')} "${kind}"`);
      return;
    }
    if (state.kind === 'warn') {
      const rel = relOut(this.cwd, state.outputPath);
      console.log(`stan: ${label('warn')} "${kind}" -> ${rel}`);
      return;
    }
    if (state.kind === 'done' || state.kind === 'error') {
      const ok = state.kind === 'done';
      const rel = relOut(this.cwd, state.outputPath);
      const lbl = ok ? label('ok') : label('error');
      const tail = ok ? '' : ' (exit 1)';
      const out = rel || '';
      console.log(`stan: ${lbl} "${kind}" -> ${out}${tail}`);
      return;
    }
    // other states (quiet, stalled, cancelled, killed, timedout) are only rendered in live mode
  }
}
