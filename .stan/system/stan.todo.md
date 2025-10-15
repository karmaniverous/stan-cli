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
  - Provide small barrels under src/runner/run/session that re‑export local helpers (ui‑queue, signals, scripts‑phase, prompt‑plan, cancel‑controller) to discourage deep internal imports.
  - Replace deep paths in tests and code with '@/runner/run/live' and '@/runner/run/session'; run knip to ensure no orphaned deep paths remain.

- Tests — consolidate cancellation suites
  - Merge cancel.parity/gate/schedule/sigint/key into one parameterized suite toggling:
    - live vs no‑live;
    - sequential vs concurrent;
    - keypress vs SIGINT;
    - archive on/off;
    - hang grace options.
  - Remove duplicated scaffolding; keep a single helper for spawning/ canceling runs and asserting archive/output presence.

- Changelog / release notes
  - Document: prompt include‑on‑change behavior, DRY barrel removal, dynamic TTY detection, PATH augmentation note.
  - Cut next patch release once docs are updated.

- Deprecation staging for config ingestion
  - Phase 1: keep legacy extractor + loader fallback; emit debugFallback notices when used; changelog guidance to run “stan init”.
  - Phase 2: require STAN_ACCEPT_LEGACY=1 for legacy; otherwise fail early with a concise message (“Run ‘stan init’ to migrate config.”).
  - Phase 3: strict stan-cli only (remove legacy acceptance).

- Docs & help updates
  - Configuration: namespaced layout only; “Migration” appendix → “run stan init”.
  - Getting Started/CLI Usage: namespaced examples; note prompt flag and PATH augmentation (already covered).
  - Init help: mention migration and .bak/--dry-run.

- Silent fallback audit (narrowed to config/migration scope)
  - Ensure debugFallback is used on: legacy engine extraction; legacy CLI loader fallback; DEFAULT_STAN_PATH resolution.
  - Tests assert no debug output unless STAN_DEBUG=1 (behavior unchanged otherwise).

- Test follow‑through
  - Add small parity checks for include‑on‑change on Windows/POSIX (core|path sources).
  - Consider a quick unit around top‑level index exports to guard against accidental re‑introduction of barrel‑of‑barrel.

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

- Tests — avoid package.json exports in fallback check
  - Removed reliance on resolving '@karmaniverous/stan-core/package.json' (may be excluded by exports). Assert the resolved path exists, ends with 'dist/stan.system.md', and is either under the temp fake base or under the installed node_modules/@karmaniverous/stan-core tree.

- Tests — relax fallback strict equality to allow installed core path
  - Accept either the temp fake prompt path or the real installed `@karmaniverous/stan-core/dist/stan.system.md` path. Still asserts the path suffix and existence to validate the fallback logic. Unblocks the unit test across dev setups.

- Cleanup — remove unused preflight module and test
  - Deleted `src/runner/preflight.ts` and `src/runner/preflight.tty.test.ts`; callers no longer import it.
  - Updated `src/runner/snap/selection-sync.test.ts` to stop mocking `@/runner/preflight`.

- DX — add live UI barrel (internal convenience)
  - Created `src/runner/run/live/index.ts` to re‑export commonly used live helpers for index‑based internal imports. No behavior changes.

- Tests — fix TS2741 in mocked createRequire.resolve and stabilize fallback path
  - Provide a proper NodeJS.RequireResolve (with `.paths`) in the mocked createRequire().resolve to satisfy TS/Typedoc; stabilizes fallback behavior on Windows paths with spaces.

- Prompt resolver follow‑through — stabilize tests & TSDoc
  - Adjust fallback test to a minimal NodeJS.Require; remove the lone any; escape @ in TSDoc to satisfy tsdoc/syntax.

- Runner (archiving) — DRY prompt-aware archive calls in session
  - Introduced small helpers to run diff/full phases with UI start/end and options.
  - Rewrote both ephemeral-prompt branches (include‑on‑change vs quiet‑diff) to use helpers.
  - Preserved prompt injection/restore sequencing and include‑on‑change behavior; no functional changes.

- Config — shared effective engine resolver (namespaced + legacy)
  - Added `src/runner/config/effective.ts` to centralize ContextConfig resolution with a transitional legacy extractor and scoped debugFallback.
  - Wired into `src/cli/run/action.ts` (label preserved: `run.action:engine-legacy`) and `src/runner/snap/context.ts` (`snap.context:legacy`).
  - Behavior unchanged; simplifies future deprecation gating (`STAN_ACCEPT_LEGACY=1`).

- Run — plan-only prints resolved prompt
  - Updated `stan run -p` path to resolve the system prompt and include a `prompt:` line in the printed plan (core/local/path/auto). Falls back to the base plan if resolution fails.

- Run — wire --prompt end‑to‑end; add debug trace; fix TSDoc
  - CLI → runner → session now pass the prompt choice so `-m core|local|<path>` is honored during the run, not just for plan formatting.
  - Planning phase resolves the prompt and injects `prompt:` into the plan; early resolution failure aborts with a single concise error (no scripts/archives).
  - Under `STAN_DEBUG=1`, exactly one diagnostic line is written to stderr before archiving: `stan: debug: prompt: <source> <absolute-path>`.
  - Resolved TSDoc warnings by escaping “@” sequences in comments.

- Lint — remove unused variable in run.action
  - Deleted `legacyWarned` local and its assignments from `src/cli/run/action.ts` (debugFallback messages unchanged).

- Imports hygiene — session barrel + test adoption
  - Re-exported common session helpers from `src/runner/run/session/index.ts` and updated a test to import from the barrel (no behavior change).

- Runner — archive wiring (ephemeral path) uses archivePhase toggles
  - Added selective phase controls to `archivePhase` (diff/full/both) with optional staging/cleanup flags.
  - Replaced direct `createArchive*` calls in the ephemeral branches with `archivePhase` and removed duplicate staging/cleanup (no behavior change).

  - Follow‑up: updated `runArchivePhaseAndCollect` to request `which: 'both'` and return optional paths to match `archivePhase`’s signature, resolving TS2322 without changing behavior.

- Tests — support: move common helper to @/test
  - Moved rmDirWithRetries from @/test.ts to @/test/index.ts.
  - Updated test imports to use "@/test"; behavior unchanged.

- Tests — support: remove legacy helper and fix path header
  - Deleted src/test/helpers.ts (superseded by @/test barrel).
  - Corrected header comment in src/test/index.ts to match its filepath.