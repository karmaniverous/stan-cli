# STAN Development Plan

Note: Aggressively enable/disable facets to keep visibility on current work while minimizing archive size. Resolve as many issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Typecheck: eliminate current TS errors and syntax/parse failures
  - Fix remaining TS errors in tests where argv normalization feeds Commander (src/cli/runner.defaults.test.ts) by ensuring readonly unknown[] → readonly string[] at the boundary only.
  - Address any stray syntax/parse errors surfaced by vitest (e.g., combine archive behavior tests) and re-run tsc until clean.
  - Reconfirm derive/loaders resolvers compile cleanly under SSR/forks.
- Lint: remove flagged unnecessary conditionals and unsafe patterns
  - Resolve @typescript-eslint/no-unnecessary-condition and unnecessary optional-chaining/nullish-coalescing across flagged modules (config/load.ts, config/schema.ts, init.ts, run/options.ts, overlay/facets.ts, patch/diagnostics.ts, patch/service.ts, run/progress/sinks/live.ts, run/live/frame.ts, run/session/orchestrator.ts, etc.).
  - Prefer explicit typeof guards over optional chaining on known shapes; keep tests free of unsafe-any by narrowing unknown results locally.
- Test: stabilize failing suites and harden cancellation paths
  - Cancel matrix (keypress + archive): guarantee no on-disk archives on cancel for live concurrent and live sequential modes; verify pre-archive guard, late-cancel checks, and best‑effort deletion loops (Windows‑skewed settle).
  - Snap defaults: fix loadSnapHandler SSR shape so stash defaults tests pass; re-run to green.
  - Combine archive behavior: fix syntax/parse issue and re-validate output/include/exclude semantics (diff dir and archive files excluded in DIFF; output included only with combine).
  - UI parity: keep live/no-live artifact parity (final-frame flush and small settles); confirm no regressions.

## Completed (context essentials only)

- Run/cancel: robust archive cleanup on user cancel
  - Added a bounded delete-and-settle loop in the session cancel return path to guarantee removal of archive.tar and archive.diff.tar even when late races leave short-lived handles (Windows-skewed). Mirrors the runner-level backstop with platform-aware settles.

- Live UI: guaranteed first-frame flush with hint
  - After UI start, issue a one-time immediate flush so a frame containing the hint line is always printed even for very fast runs. Keeps the alignment/hint expectations stable without affecting the final persisted frame.

- SSR/mocks‑robust dynamic resolvers across CLI surfaces (run action/options, derive, overlay builders) to stabilize evaluation order in vitest forks/SSR without doubling default+named exports.
- Cancel hardening at archive boundary and run-level backstops: pre-archive schedule guard, shouldContinue threading in FULL/DIFF, and best‑effort late-cancel deletions with platform-aware settles.
- Facet overlay mapping in runner config: subtree roots expanded, leaf‑globs scoped via anchors; overlay metadata recorded to .stan/system/.docs.meta.json for downstream view awareness.

- Amendment: Commander argv augmentation (types-only)
  - Simplified the augmentation to use a unified signature with `ReadonlyArray<unknown>` for `parse`/`parseAsync`, satisfying `@typescript-eslint/unified-signatures` and `no-redundant-type-constituents`. No runtime behavior change; tests pass with the existing argv normalization.

- Decompose run-session orchestrator into small helpers
  - Split prompt resolution/plan printing, UI start/prepare/flush, row queueing, cancel guard wrapper, and archive stage wrapper into dedicated modules under run-session/steps/. Public API unchanged; behavior preserved.

  - Amendment: fix TS/lint after decomposition (run-session steps)
    - Typed supervisor in archive step and corrected Promise.all catch placement; removes TS2739/TS2339 and unsafe-call lint without changing behavior.

- Amendment: wire supervisor in deps for archive step and switch to static rm import to satisfy TS/lint post-decomposition without changing behavior.
