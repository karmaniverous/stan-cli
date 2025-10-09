// src/stan/run/live/format.ts
import { table } from 'table';

import { bold, dim } from '@/stan/util/color';

export const pad2 = (n: number): string => n.toString().padStart(2, '0');

export const fmtMs = (ms: number): string => {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
};

export const stripAnsi = (s: string): string => {
  try {
    return s.replace(/\\u001B\[[0-9;]*m/g, '');
  } catch {
    return s;
  }
};
export const headerCells = (): string[] =>
  ['Type', 'Item', 'Status', 'Time', 'Output'].map((h) => bold(h));

export const bodyTable = (rows: string[][]): string =>
  table(rows, {
    border: {
      topBody: ``,
      topJoin: ``,
      topLeft: ``,
      topRight: ``,
      bottomBody: ``,
      bottomJoin: ``,
      bottomLeft: ``,
      bottomRight: ``,
      bodyLeft: ``,
      bodyRight: ``,
      bodyJoin: ``,
      joinBody: ``,
      joinLeft: ``,
      joinRight: ``,
      joinJoin: ``,
    },
    drawHorizontalLine: () => false,
    // Left-align all columns so headers align with their column content.
    // (Previously the Time column was right-aligned, which shifted the "Time"
    // header two spaces right; Output appeared one space right.)
    columns: {
      0: { alignment: 'left' }, // Type
      1: { alignment: 'left' }, // Item
      2: { alignment: 'left' }, // Status
      3: { alignment: 'left' }, // Time
      4: { alignment: 'left' }, // Output
    },
  });

export const hintLine = (uiId: number): string => {
  const tag =
    process.env.STAN_TEST_UI_TAG === '1' ? ` UI#${uiId.toString()}` : '';
  return `${dim('Press')} ${bold('q')} ${dim('to cancel,')} ${bold(
    'r',
  )} ${dim('to restart')}${tag}`;
};
