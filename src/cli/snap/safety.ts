// src/cli/snap/safety.ts
import type { Command } from 'commander';

import * as cliUtils from '@/cli/cli-utils';

type CliUtilsModule = typeof import('@/cli/cli-utils');
type ApplyCliSafetyFn = CliUtilsModule['applyCliSafety'];

/** Idempotently apply Commander safety (exitOverride + argv normalization). */
export function applyCliSafetyTo(cmd: Command): void {
  // Prefer named-or-default adapter; quietly fall back to direct methods.
  let applied = false;
  try {
    // Lazy resolve without importing the helper here to avoid cyclic SSR issues.
    const { resolveNamedOrDefaultFunction } =
      require('@/common/interop/resolve') as {
        resolveNamedOrDefaultFunction: <F>(
          mod: unknown,
          pickNamed: (m: unknown) => F | undefined,
          pickDefault: (m: unknown) => F | undefined,
          label?: string,
        ) => F;
      };
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
      (
        cliUtils as unknown as {
          installExitOverride?: (c: Command) => void;
          patchParseMethods?: (c: Command) => void;
        }
      ).installExitOverride?.(cmd);
      (
        cliUtils as unknown as {
          patchParseMethods?: (c: Command) => void;
        }
      ).patchParseMethods?.(cmd);
    } catch {
      /* best-effort */
    }
  }
  // Final safety (idempotent) to prevent “unknown command 'node'” in tests.
  try {
    (
      cliUtils as unknown as { patchParseMethods?: (c: Command) => void }
    ).patchParseMethods?.(cmd);
    (
      cliUtils as unknown as { installExitOverride?: (c: Command) => void }
    ).installExitOverride?.(cmd);
  } catch {
    /* best-effort */
  }
}
