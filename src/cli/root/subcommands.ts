// src/cli/root/subcommands.ts
import type { Command } from 'commander';

import type { RegisterInitFn, RegisterPatchFn } from './resolvers';

export const attachSubcommands = (
  cli: Command,
  deps: {
    registerRun: (c: Command) => Command;
    registerSnap: (c: Command) => Command;
    registerInit?: RegisterInitFn;
    registerPatch?: RegisterPatchFn;
  },
): void => {
  const { registerRun, registerSnap, registerInit, registerPatch } = deps;
  try {
    registerRun(cli);
  } catch {
    /* best‑effort */
  }
  try {
    const init = registerInit;
    if (init) init(cli);
  } catch {
    /* best‑effort */
  }
  try {
    registerSnap(cli);
  } catch {
    /* best‑effort */
  }
  try {
    if (registerPatch) registerPatch(cli);
  } catch {
    /* best‑effort */
  }
};
