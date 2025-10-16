// src/stan/run/live/frame.ts
// Compose a full frame body from rows + options (content-only; no I/O).
import { presentRow } from '@/runner/run/presentation';
import type { ScriptState } from '@/runner/run/types';

import { renderSummary } from '../summary';
import { bodyTable, fmtMs, headerCells, hintLine, stripAnsi } from './format';
import { computeCounts } from './util';

type InternalState = ScriptState & {
  outputPath?: string;
  startedAt?: number;
  durationMs?: number;
};
type InputRow = {
  type: 'script' | 'archive';
  item: string;
  state: InternalState;
};

export const composeFrameBody = (args: {
  rows: InputRow[];
  startedAt: number;
  boring: boolean;
  uiId: number;
  includeHint: boolean;
}): string => {
  const { rows: inRows, startedAt, boring, uiId, includeHint } = args;

  // Header row
  const header = headerCells();
  const rows: string[][] = [];
  rows.push(header);

  // Body rows
  if (inRows.length === 0) {
    const elapsed = fmtMs(Date.now() - startedAt);
    rows.push(['—', '—', boring ? '[IDLE]' : 'idle', elapsed, '']);
  } else {
    for (const row of inRows) {
      const st = row.state;
      // Map state -> presentation using the shared helper
      const mapped = presentRow({
        state: st,
        // outputPath stored on state is already repo-relative in LiveUI; relOut is idempotent.
        cwd: process.cwd(),
        now: Date.now,
      });
      rows.push([
        row.type,
        row.item,
        mapped.label,
        mapped.time,
        mapped.output ?? '',
      ]);
    }
  }

  // table: left-align all columns (configured in format.ts)
  const tableStr = bodyTable(rows);

  // Summary + optional hint
  const elapsed = fmtMs(Date.now() - startedAt);
  const counts = computeCounts(inRows.map((r) => ({ state: r.state })));
  const summary = renderSummary(elapsed, counts, boring);
  const hint = includeHint ? `\n${hintLine(uiId)}` : '';

  // Leading blank line before table; exactly one blank line between table and summary;
  // final frame ends with a single newline (no extra pad lines).
  const raw = `${tableStr.trimEnd()}\n\n${summary}${hint}`;
  const body = `\n${raw}\n`;

  // Minimal debug sanity when enabled (never throws)
  if (process.env.STAN_LIVE_DEBUG === '1') {
    try {
      const plain = stripAnsi(body);
      const headerRe = /(?:^|\n)Type\s+Item\s+Status\s+Time\s+Output(?:\n|$)/g;
      const headerMatches = (plain.match(headerRe) ?? []).length;

      console.error('[stan:live:frame]', {
        headerMatches,
        includeHint,
      });
    } catch {
      /* ignore */
    }
  }
  return body;
};
