// src/cli/snap/safety.ts
import type { Command } from 'commander';

import * as cliUtils from '@/cli/cli-utils';
import { resolveNamedOrDefaultFunction } from '@/common/interop/resolve';

type CliUtilsModule = typeof import('@/cli/cli-utils');
type ApplyCliSafetyFn = CliUtilsModule['applyCliSafety'];

/** Idempotently apply Commander safety (exitOverride + argv normalization). */
export function applyCliSafetyTo(cmd: Command): void {
  // Prefer named-or-default adapter; quietly fall back to direct methods.
  let applied = false;
  try {
    const fn = resolveNamedOrDefaultFunction<ApplyCliSafetyFn>(
      cliUtils as unknown,
      (m) => (m as CliUtilsModule).applyCliSafety,
      (m) =>
        (m as { default?: Partial<CliUtilsModule> }).default?.applyCliSafety,
      'applyCliSafety',
    );
    fn?.(cmd);
    applied = true;
  } catch {
    /* best-effort */
  }
  if (!applied) {
    try {
      // Known helpers exist; call directly under fallback.
      cliUtils.installExitOverride(cmd);
      cliUtils.patchParseMethods(cmd);
    } catch {
      /* best-effort */
    }
  }
  // Final safety (idempotent) to prevent “unknown command 'node'” in tests.
  try {
    cliUtils.patchParseMethods(cmd);
    cliUtils.installExitOverride(cmd);
  } catch {
    /* best-effort */
  }
}
