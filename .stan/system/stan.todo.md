# STAN Development Plan

## Next up (priority order)

- Derive follow‑through (run derive module)
  - Tighten types in src/cli/run/derive/index.ts; eliminate no‑unsafe‑assignment and error‑typed flows.
  - Enforce barrel usage for consumers (import from '../derive' only); remove any deep path imports.
  - Reconfirm SSR/mock paths for run‑args/cli‑utils with Vitest (forks pool).

- Run defaults & semantics (CLI)
  - getRunDefaults must prefer cli‑utils.runDefaults when available; otherwise parse stan.config.\* synchronously and merge over baselines; keep prompt/facets defaults.
  - Restore root.env.defaults and runner semantics: scripts true/false/array; -p prints plan only; -S -A prints “nothing to do”; archive=false honored.
  - Add focused tests where gaps are found.

- Cancellation matrix (guard race regressions)
  - Ensure archives are never created on cancel across live/concurrent and live/sequential; keep late‑cancel guards and settle timing stable.

  - Strengthen archive-stage cancel gates:
    - Thread a shouldContinue() guard through runArchiveStage (non‑ephemeral & ephemeral) and check before/among phase steps to abort early.
    - Keep session post-archive cleanup (best‑effort) as a backstop.
    - Add focused assertions if new race surfaces.

- Cancel matrix — ensure archives absent on any cancel return
  - src/runner/run/session/run-session.ts: added best‑effort removal of archive.tar and archive.diff.tar on all cancel-return paths (pre‑archive, late‑cancel guards, pre‑scheduling), in addition to the existing post‑archive cleanup backstop.
  - Keeps artifacts clean for both live concurrent and live sequential keypress scenarios.

- Overlay excludes mapping (facet composition)
  - Recheck facet overlay excludes/anchors propagation into RunnerConfig after recent changes; fix any propagation gaps.

- Legacy extract (transitional)
  - Exercise legacy engine detection under STAN_DEBUG=1; confirm debugFallback still fires; paths remain robust post‑split.

- Lint remediation (strict typed rules)
  - Resolve no‑unnecessary‑condition and unnecessary optional‑chaining in flagged files.
  - Address require‑await and unused vars in tests; remove accidental any flows.
  - Iterate: npm run lint:fix, then npm run lint; keep changes small and reviewable.

- CI/build/docs
  - Run build + typedoc; ensure dist/stan.system.md is copied; run knip and address any drift.

- Sanity/coverage
  - FULL includes facet.state.json; DIFF excludes anchors unless changed; confirm overlay metadata (.stan/system/.docs.meta.json) included and updated.

- Knip follow‑up (cosmetic)
  - Validate @humanwhocodes/momoa presence (typedoc/eslint types). If no longer required after lint pass, remove; otherwise annotate as intentionally retained.

---

### Live UI hint + cancel race settling (alignment + cancel matrix)

- Live alignment — ensure hint exists for fast runs
  - src/runner/run/live/renderer.ts: render an immediate first frame after writer.start(). This guarantees the “Press q to cancel, r to restart” hint is printed even for very short runs that finalize before the first interval tick.

- Cancel matrix — absorb keypress + archive race
  - src/runner/run/service.ts: add a tiny settle (15–30ms) just before returning from runSelected in both cancelled and normal paths. This allows best‑effort archive deletions on cancel to settle on all platforms (especially Windows) before tests assert existence.

Amendment:

- These changes are presentation‑only (render timing) and return‑path settling; the archive stage gates added previously remain intact.

### Rollback: immediate live render; keep cancel settle

- Reverted the “immediate first frame” change in live renderer (src/runner/run/live/renderer.ts) that caused multiple UI regressions (alignment, order/flush, parity).
- Fixed an accidental async/union injection in src/runner/run/service.ts UI selection; retained the small settle before returning on both cancel and normal completion to stabilize cancel matrix (keypress + archive) without impacting UI timing.

## Completed (append-only, most recent items last)

- Overlay excludes mapping — honor explicit facet overrides
  - src/cli/run/action/overlay.ts: map engine excludes when overlay is enabled OR explicit per‑run facet overrides are provided (‑f/‑F names or naked ‑f), and propagate leaf‑globs under the same guard. Ensures subtree roots expand to "<root>/**" and leaf‑globs (e.g., "**/\*.test.ts") pass through as expected in CLI overlay mapping tests.

- Lint nibble — remove redundant nullish coalescing in derive loader
  - src/cli/run/action/loaders.ts: dropped “?? undefined” flagged by @typescript-eslint/no-unnecessary-condition (no behavior change).

- UI parity — stabilize immediate archive visibility after run
  - src/runner/run/session/run-session.ts: add a brief post‑archive settle (timeout + yieldToEventLoop) after archivePhase completes, before final flush/return. Improves cross‑platform stability for tests that assert presence of archive.tar and archive.diff.tar immediately after runSelected.

- Derive loader — expand SSR/mocks fallbacks to restore CLI run semantics tests
  - src/cli/run/action/loaders.ts: loadDeriveRunParameters now tolerates default.default, module-as-function, and scans default/top-level callable shapes (parity with other loaders).
  - Fixes deriveRunParameters resolution under Vitest SSR; unblocks runner.semantics.v2.

- Decompose run derive module (smaller files; stable import path)
  - Replaced monolith src/cli/run/derive.ts with a directory module:
    - derive/index.ts (composition)
    - derive/run-defaults.ts (SSR‑robust defaults)
    - derive/dri.ts (named‑or‑default resolver)
    - derive/types.ts (local shapes). Existing imports of "../derive" continue to work.

- Decomposition follow‑through — path fixes
  - src/cli/run/derive/dri.ts: fix relative import to ../../run-args.
  - src/cli/run/derive/run-defaults.ts: fix relative import to ../../cli-utils.

- Tests — derive loader fallbacks (SSR resilience)
  - Added src/cli/run/derive/resolve.test.ts to exercise resolveDRI against default-shaped modules (function-as-default and default object property).
  - Locks the SSR fallback behavior for derive loader resolution.

- Tests — overlay excludes mapping (naked -f)
  - Added src/cli/runner.overlay.naked-f.test.ts to verify the “shouldMap” shortcut engages for naked -f (no names) while producing no engine excludes (all facets active → no hiding).

- Tests — fixes for derive resolver and naked -f overlay
  - src/cli/run/derive/resolve.test.ts: mock "../../run-args" (exact specifier used by dri.ts) via asEsmModule; remove invalid "void" casts; assert callability.
  - src/cli/runner.overlay.naked-f.test.ts: expect plan line "overlay: off" when global overlay is disabled; engineExcludes still empty under naked -f.

- Defaults — plan-only when scripts=false by default
  - src/cli/run/derive/index.ts: when cliDefaults.run.scripts=false and no CLI archive flag is provided, default archive to false to preserve v2 semantics.

- Prompt — export shape discipline (no doubled default+named)
  - Updated .stan/system/stan.project.md (SSR/ESM playbook) to explicitly prohibit exporting the same API as both default and named as an SSR workaround; mandate resolvers in tests/adapters instead.

- Lint nibble — remove unnecessary coalescing in derive
  - src/cli/run/derive/index.ts: replaced Object.keys(scripts ?? {}) with Object.keys(scripts) (scripts is non‑nullable in the signature).

- Lint sweep — optional chaining on non‑nullable values
  - src/runner/run/control.ts: replaced optional chaining on stdin/UI methods with explicit typeof guards (setRawMode/resume/on/off/removeListener/pause).
  - src/runner/run/session/run-session.ts: replaced optional chaining on UI hooks (prepareForNewSession/flushNow) and stdin.pause with typeof guards.
- Stability — SSR fallbacks for archive stage resolvers (no behavior change)
  - src/runner/run/session/archive-stage/imports.ts: accept default-as-function, module-as-function, and shallow default scans for archivePhase/stageImports.

- Tests — CLI defaults argv normalization
  - src/cli/runner.defaults.test.ts: local safety adapter now also normalizes argv like ["node","stan", ...] to avoid Commander treating "node" as a subcommand under SSR/mocks. Prevents inadvertent process.exit during parse.
  - Stabilizes runner.defaults tests without relying on internal cli-utils shapes.

- Cancellation robustness — early abort in archive stage
  - src/runner/run/session/archive-stage/index.ts: accept optional shouldContinue and abort when false.
  - src/runner/run/session/archive-stage/run-normal.ts: check shouldContinue between DIFF/FULL phases.
  - src/runner/run/session/archive-stage/run-ephemeral.ts: check shouldContinue around staging/prep and each phase; return early when cancelled.
  - src/runner/run/session/run-session.ts: pass shouldContinue to archive stage (linked to CancelController).
  - Improves keypress + archive cases in cancel matrix tests.

- Facet overlay — enable live‑ui facet to pursue live UI test failures
  - Turned on `live-ui` to include anchored writer, live renderer, and UI modules in archives for immediate triage of failing live tests.
  - Kept other facets disabled (except run‑session, run‑archive, snap) to minimize archive size; will adjust enablement in subsequent turns as test/lint work advances.

- Facet overlay — disable snap to reduce archive size while focusing live/cancel tests
  - Turned off `snap` facet (snap modules currently passing and not under investigation).
  - Kept `live-ui`, `run-session`, and `run-archive` enabled to triage remaining failing tests.

- Facet overlay — enable run‑exec for cancellation triage
  - Turned on `run-exec` to include execution helpers involved in keypress/SIGINT handling and process supervision while investigating cancel + archive cases.
  - Kept `live-ui`, `run-session`, and `run-archive` enabled; `snap` remains disabled to minimize archive size.

- CLI run semantics (defaults) — plan-only when selection empty and archive disabled
  - src/cli/run/action/index.ts: early-return plan-only when derived selection is [] and archive is false (no flags), matching v2 expectations.
  - Tests: src/cli/runner.defaults.test.ts updated to execute the “scripts=true” case (no -p) and assert selection from the recorded call; the “scripts=false + archive=false” case now exits early without invoking runSelected.
  - This also avoids Commander/SSR exit surprises and removes reliance on plan flag for that assertion.

### Facet overlay trimming — reduce archive size without blocking current fixes

- Deactivated non-essential facets: ci, docs, init, patch, prompt, snap, tests, vscode.
- Kept active for immediate test/debug work: live-ui, run-session, run-archive, run-exec, overlay.
- Rationale: current failures center on live UI rendering/ordering, cancel matrix (keypress + archive), parity, and overlay mapping; trimming unrelated facets shrinks context while preserving needed surfaces.

- Live UI — guarantee hint/header on fast runs
  - src/runner/run/live/renderer.ts: render an immediate first frame after writer.start() to ensure the header, summary, and hint are visible even for very short sessions. Finalize remains hint‑free for the last frame.

- Cancel matrix — belt‑and‑suspenders archive cleanup
  - src/runner/run/service.ts: on outer cancellation path in runSelected, best‑effort remove archive.tar and archive.diff.tar and allow a brief settle to stabilize visibility across platforms. Complements existing session‑level guards.

- Root env defaults — SSR/mock‑robust engine config fallback
  - src/cli/run/action/index.ts: when resolveEngineConfigLazy cannot be resolved under SSR/mocks, derive a minimal ContextConfig via resolveStanPathSync (fallback ".stan") to keep `stan run -p` and env default tests from throwing.
