# STAN Development Plan

## Next up (priority order)

- DRY/codebase reduction — safe wins
  - Archive barrel
    - Add src/runner/run/archive/index.ts re‑exporting archivePhase, util (cleanupOutputsAfterCombine, cleanupPatchDirAfterArchive), and printable.
    - Update imports to use '@/runner/run/archive' instead of deep subpaths.
  - Snap barrel
    - Add src/runner/snap/index.ts re‑exporting capture/context/git/history/selection/shared and snap‑run.
    - Update CLI handlers/tests to import from the barrel (avoid deep paths).
  - Shared YAML/JSON parse helper
    - Create src/common/config/parse.ts (parseText + friendly error wrapper) and adopt in cli/config/load.ts and runner/config/effective.ts (and any ad‑hoc reads).
    - Keep error messaging consistent; remove duplicates.
  - Barrel adoption sweep
    - Replace any remaining deep imports with the new progress/presentation/archive/snap barrels.
    - Grep for '/presentation/row', '/progress/', '/run/archive/', '/runner/snap/' deep paths and update.

- Optional refactors (medium effort; clear payoff)
  - Base sink scaffolding (progress)
    - Extract a tiny BaseSink for subscribe/unsubscribe + onUpdate dispatch; keep LoggerSink/LiveSink focused on logging/rendering.
  - Common UI wiring helper
    - Factor a helper to forward queue/start/end events via lifecycle.ts; reduce boilerplate in LiveUI/LoggerUI without changing behavior.
  - Consolidate early config peek
    - Centralize a helper to read/parse stan.config.\* once and emit maybeDebugLegacy with a consistent scope label; reduce duplicate YAML/JSON parsing and debug labeling.

- Test‑only DRY
  - Expand test‑support adoption
    - Prefer startRun/writeScript/rmDirWithRetries in suites that still open‑code temp repos/spawns.
  - Normalize barrel usage in tests
    - Update tests to import via barrels instead of deep paths (progress/presentation/archive/snap).

- Nice‑to‑have cleanups
  - Scope constants for debug labels
    - Centralize scope strings used by debugFallback (e.g., 'run.action:engine‑legacy') to keep logs/tests consistent.
  - Import hygiene/knip
    - After barrel sweep, run knip and prune any newly orphaned internals; keep barrels the only public entry points for their areas.

- Changelog / release notes
  - Document: prompt include‑on‑change behavior, DRY barrel adoption, dynamic TTY detection, PATH augmentation note.
  - Cut next patch release once docs are updated.

- Deprecation staging for config ingestion
  - Phase 1: keep legacy extractor + loader fallback; emit debugFallback notices when used; changelog guidance to run “stan init”.
  - Phase 2: require STAN_ACCEPT_LEGACY=1 for legacy; otherwise fail early with a concise message (“Run ‘stan init’ to migrate config.”).
  - Phase 3: strict stan‑cli only (remove legacy acceptance).

- Docs & help updates
  - Configuration: namespaced layout only; “Migration” appendix → “run stan init”.
  - Getting Started/CLI Usage: note prompt flag and PATH augmentation (already covered).
  - Init help: mention migration and .bak/--dry‑run.
  - Contributor note: barrels and cycle‑avoidance (do not import the session barrel from within session submodules; prefer local relative imports when a barrel would induce a cycle).

- Silent fallback audit (config/migration scope)
  - Ensure debugFallback is used on: legacy engine extraction; legacy CLI loader fallback; DEFAULT_STAN_PATH resolution.
  - Tests assert no debug output unless STAN_DEBUG=1.

- Test follow‑through
  - Add small parity checks for include‑on‑change on Windows/POSIX (core|path sources).
  - Quick unit around top‑level index exports to guard against accidental “barrel of barrels”.

- CI speed
  - Shorten durations/timeouts in the cancellation matrix to reduce wall clock while preserving coverage.

- Build guard
  - Add a CI check that fails on new circular dependencies (Rollup/TS plugin or simple analyzer) to prevent regressions.

---

## Backlog / follow‑through

- Snapshot UX
  - Improve `snap info` formatting (clearer current index marking; optional time‑ago column).

- Live UI niceties (post‑stabilization)
  - Optional Output column truncation to available columns (avoid terminal wrapping when paths are long).
  - Optional alt‑screen mode (opt‑in; disabled by default).

- Docs/site
  - Expand troubleshooting for “system prompt not found” and PATH issues with suggestions (`--prompt core`, install missing devDeps, or invoke via pkg manager).

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
  - stan init migrates legacy → namespaced; backup + dry‑run supported. [PENDING]
  - Legacy engine keys honored via synthesized ContextConfig during transition; debugFallback notice only. [PENDING]
  - Deprecation phases implemented (env‑gated, then strict). [PENDING]
- Tests/docs:
  - Migration tests (YAML/JSON/mixed; idempotent; backups; dry‑run). [PENDING]
  - Transitional extraction tests (legacy excludes/includes honored). [PENDING]
  - Docs updated (namespaced examples; migration appendix; init help). [PENDING]

---

## Completed (recent)

- Imports barrels — progress & presentation
  - Added src/runner/run/progress/index.ts; LiveUI/LoggerUI now import ProgressModel/LiveSink/LoggerSink via the barrel.
  - Added src/runner/run/presentation/index.ts; Live frame and Logger sink import presentRow via the barrel.
  - Avoided session cycles by keeping local relative imports within the session subtree.

- Archive wiring — single entry
  - Confirmed runtime paths use archivePhase exclusively; no reachable direct createArchive/createArchiveDiff calls (tests may use core APIs by design).
  - stageImports is de‑duplicated (staged once per run; archivePhase invoked with stage: false).

- Barrels & shared config parser (CLI/runner)
  - Added src/runner/run/archive/index.ts and src/runner/snap/index.ts to provide stable, public barrels for archive and snap surfaces.
  - Updated CLI and logger imports to consume the new barrels (snap handlers and archive printable).
  - Introduced src/common/config/parse.ts and adopted it in:
    - src/cli/config/load.ts
    - src/runner/config/effective.ts
    - src/cli/run/action.ts (early legacy peek)
    - src/cli/runner/options.ts (preAction legacy notice)
  - Keeps YAML/JSON parsing consistent across CLI and runner; removes ad‑hoc duplicates.

- Archive barrel conflict fix & cleanup
  - Moved src/runner/run/archive.ts → src/runner/run/archive/phase.ts to ensure
    imports of "@/runner/run/archive" resolve to the new folder barrel instead of
    the legacy file.
  - Updated src/runner/run/archive/index.ts to re‑export archivePhase from "./phase".
  - Removed unused duplicate src/cli/runner/options.ts (CLI uses src/cli/run/options.ts);
    resolves knip’s “Unused files” warning.