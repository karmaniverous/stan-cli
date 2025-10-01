/** src/stan/preflight.ts
 * Preflight checks run at the start of `stan run`:
 * - Warn when local system prompt drifts from packaged baseline.
 * - Nudge to run `stan init` after upgrades when packaged docs changed.
 */

import { alert, dim } from '@/stan/util/color';

import { getVersionInfo } from './version';

/** Run preflight and print warnings (TTY-aware). */
export const preflightDocsAndVersion = async (cwd: string): Promise<void> => {
  const v = await getVersionInfo(cwd);
  const isInteractive = Boolean(
    (process.stdout as unknown as { isTTY?: boolean })?.isTTY,
  );

  // Suppress drift warnings in these cases:
  // - developing STAN itself (module root == repo root),
  // - explicitly suppressed via env,
  // - test environment (unless explicitly forced),
  // - when no local system prompt exists (managed from package),
  // - or when already in sync.
  const suppressDrift =
    !v.systemPrompt.localExists ||
    v.systemPrompt.inSync ||
    v.isDevModuleRepo ||
    process.env.STAN_SUPPRESS_DRIFT === '1' ||
    (process.env.NODE_ENV === 'test' &&
      process.env.STAN_FORCE_DRIFT_WARN !== '1');

  if (!suppressDrift) {
    if (isInteractive) {
      console.warn(
        alert(
          'stan: warning: local system prompt differs from packaged baseline.',
        ),
      );
      console.warn(
        dim(
          '      Edits in downstream repos will be overwritten by `stan init`.',
        ),
      );
      console.warn(
        dim(
          '      Move customizations to <stanPath>/system/stan.project.md instead.',
        ),
      );
    } else {
      // Non‑TTY: concise, single-line notice suitable for logs/CI
      console.warn(
        'stan: warning: system prompt drift detected; run `stan init` to update (non‑TTY)',
      );
    }
  }

  // Post-upgrade nudge when packaged docs changed (based on recorded install version)
  if (!v.isDevModuleRepo && v.packageVersion && v.docsMeta?.version) {
    const prev = v.docsMeta.version;
    const cur = v.packageVersion;
    if (prev !== cur) {
      if (isInteractive) {
        console.log(
          `stan: docs baseline has changed since last install (${prev} -> ${cur}).`,
        );
        console.log(
          dim('      Run `stan init` to update prompts in your repo.'),
        );
      } else {
        // Non‑TTY: concise, single-line nudge
        console.log(
          `stan: docs baseline changed ${prev} -> ${cur}; run \`stan init\` to update`,
        );
      }
    }
  }
};
