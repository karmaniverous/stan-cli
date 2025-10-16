# STAN Development Plan

## Next up (priority order)

- Cancellation stabilization (follow‑through)
  - Re‑run the cancellation matrix on POSIX in CI to confirm the secondary late‑cancel guard closes the remaining race in no‑live sequential + archive.
  - Keep liveTrace.session enabled when investigating flakes; remove or keep instrumentation as low‑noise trace only.
  - If any residual flake remains, consider increasing the secondary settle delay slightly on CI only.

- Test‑only DRY
  - Expand test‑support adoption
    - Prefer startRun/writeScript/rmDirWithRetries in suites that still open‑code temp repos/spawns.
  - Normalize barrel usage in tests
    - Update tests to import via barrels instead of deep paths (progress/presentation/archive/snap).

- Nice‑to‑have cleanups
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
  - Moved src/runner/run/archive.ts → src/runner/run/archive/phase.ts to ensure imports of "@/runner/run/archive" resolve to the new folder barrel instead of the legacy file.
  - Updated src/runner/run/archive/index.ts to re‑export archivePhase from "./phase".
  - Removed unused duplicate src/cli/runner/options.ts (CLI uses src/cli/run/options.ts); resolves knip’s “Unused files” warning.

- Early config peek consolidation
  - Added shared helpers at src/cli/config/peek.ts: • peekAndMaybeDebugLegacySync for Commander preAction hooks, • peekAndMaybeDebugLegacy for async action handlers.
  - Updated: • src/cli/run/options.ts (preAction) to use the sync helper, • src/cli/run/action.ts to use the async helper.
  - Behavior unchanged; centralizes legacy notice logic and reduces duplication.

- Barrel adoption sweep — archive stageImports
  - Re-exported stageImports from src/runner/run/archive/index.ts and updated src/runner/run/session/archive-stage.ts to import it via the archive barrel (no deep util path). This completes the remaining archive barrel adoption.

  - Tests — normalized snap barrel usage
    - Updated src/runner/snap/selection-sync.test.ts to import handleSnap from the snap barrel ('@/runner/snap') instead of the deep path '@/runner/snap/snap-run'. Continue normalizing other tests to prefer barrels where available.

  - Barrels — prompt helpers
    - Added src/runner/prompt/index.ts as a public barrel re-exporting prompt helpers, and updated src/runner/prompt/resolve.test.ts to import from '@/runner/prompt' instead of the deep path '@/runner/prompt/resolve'. Continue normalizing remaining tests as barrels become available.

  - Run cancellation — secondary late‑cancel settle before archive
    - Added a short settle + extra yield and re‑check immediately before the archive phase to absorb very‑late SIGINT delivery in no‑live sequential runs.
    - Logged a concise liveTrace.session note when this secondary guard triggers to aid diagnosis without noisy output.

  - Run cancellation — late-cancel guard before archive phase
    - Added a yield re-check of cancellation immediately before starting the archive phase in src/runner/run/session/index.ts. This closes a narrow race where SIGINT could arrive between script completion and archive start, preventing archives from being written after user cancellation.

  - Cancellation matrix — stabilization verification (Windows)
    - Matrix passes across live/no‑live × mode × signal × archive on Windows.
    - No archives are created on cancel in any combo, including the no‑live sequential SIGINT + archive case.
    - Next: run the same matrix on POSIX in CI to confirm cross‑platform stability; keep liveTrace.session instrumentation available but low‑noise.

- Debug scopes — centralized labels
  - Added src/runner/util/debug-scopes.ts with shared constants for scope labels used by debugFallback and legacy notices.
  - Updated CLI/runner call sites to import and use these constants: • src/cli/config/load.ts, • src/cli/run/options.ts, src/cli/run/action.ts, • src/runner/config/effective.ts, src/runner/snap/context.ts.

- Base sink scaffolding (progress)
  - Introduced src/runner/run/progress/sinks/base.ts to centralize ProgressModel subscription/unsubscription.
  - LiveSink and LoggerSink now extend BaseSink, removing duplicated subscribe/stop wiring.
  - No behavioral changes; rendering and logging remain identical. This reduces boilerplate and clarifies responsibilities.

- UI wiring helper — DRY end-of-row forwarding
  - Added src/runner/run/ui/forward.ts with createUiEndForwarders(model, { useDurations }).
  - LiveUI now delegates onScriptEnd/onArchiveEnd with useDurations=true (preserves durations/exit code).
  - LoggerUI now delegates onScriptEnd/onArchiveEnd with useDurations=false (parity: no durations).
  - No behavior changes; reduces boilerplate and keeps responsibilities in lifecycle.ts.

- Cancellation scheduling gate — pre-spawn guard hardening
  - In sequential mode, added a CI/POSIX‑aware guard window and an extra yield before starting the next script to further absorb very‑late SIGINT delivery.
  - Guard computation:
    - base 25 ms; +25 ms when CI is truthy; +10 ms on POSIX.
  - Keeps local/default behavior snappy while making CI more resilient.
  - No changes to archive logic; complements the existing late‑cancel guards before the archive phase.
