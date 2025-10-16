/* src/runner/run/progress/sinks/logger.ts */

import { archivePrintable } from '@/runner/run/archive';
import { presentRow } from '@/runner/run/presentation';
import type { ProgressModel } from '@/runner/run/progress/model';
import type { RowMeta, ScriptState } from '@/runner/run/types';

import { BaseSink } from './base';

export class LoggerSink extends BaseSink {
  constructor(
    model: ProgressModel,
    private readonly cwd: string,
  ) {
    super(model);
  }

  start(): void {
    this.subscribeModel();
  }

  stop(): void {
    this.unsubscribeModel();
  }

  protected onUpdate(_key: string, meta: RowMeta, state: ScriptState): void {
    const item = meta.item;
    const printable =
      meta.type === 'archive'
        ? archivePrintable(item === 'diff' ? 'diff' : 'full')
        : item;
    const mapped = presentRow({ state, cwd: this.cwd });
    if (state.kind === 'waiting') {
      console.log(`stan: ${mapped.label} "${printable}"`);
      return;
    }
    if (state.kind === 'running') {
      console.log(`stan: ${mapped.label} "${printable}"`);
      return;
    }
    if (state.kind === 'warn') {
      console.log(`stan: ${mapped.label} "${printable}" -> ${mapped.output}`);
      return;
    }
    if (state.kind === 'done' || state.kind === 'error') {
      const ok = state.kind === 'done';
      const lbl = mapped.label;
      // Preserve explicit non-zero exit tail behavior (unchanged)
      const tail = ok ? '' : ' (exit 1)';
      const out = mapped.output || '';
      console.log(`stan: ${lbl} "${printable}" -> ${out}${tail}`);
      return;
    }
    // other states (quiet, stalled, cancelled, killed, timedout) are only rendered in live mode
  }
}
