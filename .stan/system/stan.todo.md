# STAN Development Plan

When updated: 2025-10-15 (UTC)

This plan tracks near‑term and follow‑through work for the stan‑cli package (CLI and runner). The stan‑core split is complete; engine work is tracked in the stan‑core repository.

---

## Next up (priority order)

- Archive wiring — unify phase helper
  - Prefer archivePhase/runArchivePhaseAndCollect as the single implementation entry.
  - Add phase toggles so the ephemeral quiet‑diff path can run diff‑only (no prompt injection) then full‑only (with injection) without calling createArchive\*/createArchiveDiff directly.
  - Remove any residual direct createArchive/createArchiveDiff calls reachable at runtime and de‑duplicate stageImports usage.

- Imports hygiene — add and adopt barrels
  - Provide small barrels under src/runner/run/session that re‑export local helpers (ui‑queue, signals, scripts‑phase, prompt‑plan, cancel‑controller) to discourage deep internal imports. [partially DONE — session barrel extended with invoke-archive]
  - Replace deep paths in tests and code with '@/runner/run/live' and '@/runner/run/session' (begun: live-ui, archive-stage, live alignment test).
  - Follow‑through: expand adoption across remaining modules and run knip to catch any orphaned deep imports.
    - Guideline: avoid importing the session barrel from within session submodules when it induces cycles; prefer local relative imports (e.g., archive-stage -> ./invoke-archive).
    - Cycle fix pending verification in build output.

- Changelog / release notes
  - Document: prompt include‑on‑change behavior, DRY barrel removal, dynamic TTY detection, PATH augmentation note.
  - Cut next patch release once docs are updated.
- Knip gating
  - After the DRY sweep, run knip and make it part of CI to catch orphaned deep imports early (in addition to ad‑hoc pre‑release runs).

- Deprecation staging for config ingestion
  - Phase 1: keep legacy extractor + loader fallback; emit debugFallback notices when used; changelog guidance to run “stan init”.
  - Phase 2: require STAN_ACCEPT_LEGACY=1 for legacy; otherwise fail early with a concise message (“Run ‘stan init’ to migrate config.”).
  - Phase 3: strict stan-cli only (remove legacy acceptance).

- Docs & help updates
  - Configuration: namespaced layout only; “Migration” appendix → “run stan init”.
  - Getting Started/CLI Usage: namespaced examples; note prompt flag and PATH augmentation (already covered).
  - Init help: mention migration and .bak/--dry-run.
  - Contributor note: add a brief guideline on barrels and avoiding cycles (do not import the session barrel from within session submodules; prefer local relative imports when barrel usage induces cycles).

- Silent fallback audit (narrowed to config/migration scope)
  - Ensure debugFallback is used on: legacy engine extraction; legacy CLI loader fallback; DEFAULT_STAN_PATH resolution.
  - Tests assert no debug output unless STAN_DEBUG=1 (behavior unchanged otherwise).

- Test follow‑through
  - Add small parity checks for include‑on‑change on Windows/POSIX (core|path sources).
  - Consider a quick unit around top‑level index exports to guard against accidental re‑introduction of barrel‑of‑barrel.
  - Expand adoption of test‑support/run helpers (startRun/writeScript) across repetitive runSelected suites to reduce duplication and improve maintainability.

- CI speed
  - Shorten durations/timeouts in the cancellation matrix to reduce wall clock while preserving coverage.

- Build guard
  - Add a CI check that fails on new circular dependencies (e.g., Rollup/TS plugin or a simple analyzer) to prevent regressions.

---

## Backlog / follow‑through

- Snapshot UX follow‑through
  - Improve `snap info` formatting (clearer current index marking; optional time‑ago column).

- Live UI niceties (post‑stabilization)
  - Optional Output column truncation to available columns (avoid terminal wrapping when paths are long).
  - Optional alt‑screen mode (opt‑in; disabled by default).

- Docs/site
  - Expand troubleshooting for “system prompt not found” and PATH issues with suggestions (`--prompt core`, install missing devDeps, or invoke via package manager). (ongoing)

- Live view debugging (graceful)
  - Explore an approach to surface debug traces alongside the live table without corrupting its layout (e.g., a reserved log pane, a toggleable overlay, or a ring buffer dumped on finalize). Aim to preserve readability and avoid cursor/control sequence conflicts.

---

## Acceptance criteria (near‑term)

- `stan run`:
  - `-m/--prompt` fully supported; `cliDefaults.run.prompt` honored. [DONE]
  - Early failure pathways print one concise error and do not run scripts/archives. [DONE]
  - Plan header prints `prompt:` line (except with `-P`). [DONE]
  - The system prompt is part of both full and diff flows; restoration occurs on completion/error; no gratuitous rewrites. [DONE]
  - Child PATH augmentation ensures repo‑local binaries resolve without globals across platforms/monorepos. [DONE]
- `stan snap`:
  - No drift/docs messages printed; snapshot behavior and history unchanged. [DONE]
- Config swing:
  - stan init migrates legacy → namespaced; backup + dry-run supported. [PENDING]
  - Legacy engine keys honored via synthesized ContextConfig during transition; debugFallback notice only. [PENDING]
  - Deprecation phases implemented (env‑gated, then strict). [PENDING]
- Tests/docs:
  - Migration tests (YAML/JSON/mixed; idempotent; backups; dry-run). [PENDING]
  - Transitional extraction tests (legacy excludes/includes honored). [PENDING]
  - Docs updated (namespaced examples; migration appendix; init help). [PENDING]

---

## Completed (recent)

- Tests — support: move common helper to @/test
  - Moved rmDirWithRetries to @/test/index.ts; updated imports; behavior unchanged.

- Tests — support: remove legacy helper and fix path header
  - Deleted src/test/helpers.ts; corrected header in src/test/index.ts.

- Live/log UI — DRY row → presentation mapping
  - Added src/runner/run/presentation/row.ts; adopted by live composer and logger sink.

- Tests — consolidate cancellation suites and dedupe tar mocks
  - Introduced matrix-driven cancellation suite; shared helpers in src/test-support/run.ts; rely on global tar mock.

- Runner — reuse a single printable helper for archive rows
  - Added archivePrintable helper; adopted by logger sink.

- CLI — centralize legacy engine detection notice
  - Shared detectLegacyRootKeys/maybeDebugLegacy; consistent notice in options/action.

- Tests — fix keypress cancellation in matrix (TTY stdin)
  - Ensure stdin.isTTY=true for keypress tests; archives correctly skipped on cancel.

- Lint — escape “>” in TSDoc for archive row printable
  - Escaped to satisfy tsdoc/syntax; keeps lint clean.

- Imports hygiene — adopt barrels in code/tests (phase 1 & 2)
  - Adopt live/session barrels broadly; avoid deep imports; keep cycles out of session subtree.

- Build — break session/archive-stage circular dependency
  - Local import in archive-stage to avoid session barrel cycle.

- DRY — remove duplicate plan test
  - Deleted redundant test (plan.test.ts kept).

- DRY — unify archive invocation
  - Use archivePhase('both') directly; removed invoke-archive helper.

- DRY — snap history
  - Extracted restoreEntryAt; removed duplication in undo/redo/set flows.

- DRY — non‑TTY hang messages
  - Centralized stall/timeout/kill logs in run/logs.ts and adopted in scripts-phase.

- DRY — archive-stage helpers
  - Factored baseCfg/progress hooks; reduced repetition across archivePhase calls.

- DRY — UI base utilities: shared row lifecycle helpers
  - Extracted shared “row lifecycle” helpers into `src/runner/run/ui/lifecycle.ts`
    (queue/start/end for scripts and archives).
  - Adopted in LiveUI and LoggerUI; rendering/logging remain separate (no behavior change).

- DRY — snap selection helper
  - Added `src/runner/snap/selection.ts` with `readSelection(cwd) → { stanPath, includes, excludes }`.
  - Refactored `snap-run` to reuse `readSelection` when writing snapshots.
  - Tests unaffected; behavior unchanged.

- Hygiene — knip duplicate export
  - Removed default export from `src/runner/snap/selection.ts` to avoid duplicate exports
    (keep named `readSelection` only). 