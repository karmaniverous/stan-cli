// src/cli/stan/header.ts
import { go, isBoring } from '@/stan/util/color';

type Kind = 'run' | 'snap' | 'patch';

const TOKENS: Record<Kind, string> = {
  run: '▶︎ run',
  snap: '▣ snap',
  patch: '▲ patch',
};

/**
 * Print a standardized CLI header with BORING/TTY-aware tokens.
 * Example: stan: ▶︎ run (last command: snap)
 */
export const printHeader = (kind: Kind, last: string | null): void => {
  const token = isBoring() ? kind : go(TOKENS[kind]);
  const lastText = last ?? 'none';
  console.log(`stan: ${token} (last command: ${lastText})`);
};
