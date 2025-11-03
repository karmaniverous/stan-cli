# STAN Development Plan

Note: Aggressively enable/disable facets to keep visibility on current work while minimizing archive size. Resolve as many issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Re‑run full CI locally and smoke CLI surfaces (run/snap/patch) in a temp repo.
- Snap to refresh the baseline (.stan/diff/.archive.snapshot.json) and attach updated archives in the next turn.
- Audit for any remaining default‑export shims or dynamic resolvers in CLI codepaths; remove them or replace with a single canonical named export per module.
- Grep for resolveNamedOrDefaultFunction across CLI; ensure usage is limited to SSR‑safe runtime resolvers only where strictly required by engine/peer boundaries.
- Optional: expand tests to pin recent refactors (CLI run/options and patch/register) and keep coverage trending upward.

## Completed (context essentials only)

‑ Build warnings filter: ignore specific known Rollup warnings, keep others visible
  - Anchored the build warnPattern to line start and set flags to multiline (mi).
  - Continue to ignore:
    - “[plugin typescript] … outputToFilesystem option is defaulting to true”
    - “Circular dependency … node_modules/zod/…”
  - Preserve all other “(!) …” warnings for visibility.
‑ Facets: enabled‑wins across leaf‑glob vs subtree conflicts
  - Fix overlay behavior so an enabled facet’s leaf‑glob patterns are not hidden by other disabled facets’ subtree excludes.
  - Implementation:
    - In computeFacetOverlay, collect leaf‑glob “tails” from ACTIVE facets (e.g., “**/*.test.ts” -> “*.test.ts”).
    - For any remaining inactive subtree roots after tie‑breakers, add scoped anchors “<inactiveRoot>/**/<tail>” to re‑include those files.
    - This complements the existing behavior that re‑includes INACTIVE facets’ leaf‑globs under ACTIVE roots.
  - Result:
    - With overlay on, “tests” facet active, and another facet excluding “src/**”, patterns like “src/**/*.test.ts” are anchored and remain visible in archives.
  - Tests:
    - Added “enabled‑wins: active leaf‑glob patterns are re‑included under inactive subtree roots” to src/runner/overlay/facets.test.ts.

- Tests/SSR fallthrough cleanup (static imports; remove flaky suite)
  - Replaced SSR/test-only dynamic loaders in the run registrars with static named imports (runner index, action).
  - Simplified snap options default tagging to a static import.
  - Removed the legacy jsdiff fallback test (src/cli/patch.jsdiff.test.ts) that mocked legacy shapes and exercised SSR-only paths; engine behavior remains covered in stan-core.
  - Outcome: code base is tested on its own terms; fewer test-only fallthroughs; reduced flake surface.

- CLI derive: replace dynamic resolver with static named import
  - Removed src/cli/run/derive/dri.ts and updated derive/index.ts to import deriveRunInvocation directly.
  - Fixes “deriveRunInvocation not found” in live defaults tests and aligns the CLI with the “static named imports only” policy.

- Runner service: static named imports for plan/session
  - Switched src/runner/run/service.ts to import renderRunPlan and runSessionOnce directly.
  - Eliminates Rollup “Missing exports (default)” warnings and simplifies bundling.

- Tests: ESM‑safe mocking for core prompt path
  - Refactored src/runner/run/prompt.resolve.plan.test.ts to use vi.doMock with an ESM‑shaped factory (asEsmModule) instead of vi.spyOn against a module namespace.
  - Resolves the ESM spying limitation and keeps the test deterministic.

- Dead code cleanup (knip)
  - Removed unused files flagged by knip: src/test-support/run.ts, src/test/mock-tar.ts, src/cli/root/action.ts.

- Lint: TSDoc ‘>’ escape
  - Escaped ‘>’ in src/cli/snap/action.ts TSDoc to silence warnings.

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

- DRY: unify duplicate archive-stage flows
  - Replaced run-ephemeral.ts and run-normal.ts with a single unified helper (run-archive.ts) that handles ephemeral and non-ephemeral paths (include-on-change, prepare/restore, imports staging) with one implementation.
  - Updated archive-stage/index.ts to dispatch into the unified helper; deleted the duplicated modules.

- DRY: shared raw config reader for sync fallbacks
  - Introduced src/cli/config/raw.ts (readRawConfigSync, helpers) and refactored help footer, run/config-fallback, run-defaults, and root defaults to use it instead of bespoke read+parse code.

- Consistency: SSR “named-or-default” resolution
  - Removed local tryResolveNamedOrDefault shims and used the shared resolveNamedOrDefaultFunction in src/runner/run/service.ts and src/cli/runner/index.ts (kept callable-default last-chance fallback where already present).

- Lint (enabled facets) + facet ramp-up
  - Cleaned the remaining rule in run‑ui by removing an unnecessary optional chain on RunnerControl.detach().
  - Enabled overlay and snap facets to expose their lint surfaces next turn while keeping the archive scope small (patch/init/tests remain disabled).
  - Next: sweep lint in overlay (facets.ts) and snap (handlers/safety) once included in the archive.

- Lint (init service): remove unnecessary coalescing/casts
  - Derive UI seeds and force path: replaced casts that masked undefined and triggered @typescript-eslint/no-unnecessary-condition with explicit typeof guards.
  - Next: address overlay/facets optional-chaining and snap handler coalescing in the following pass.

- Lint (overlay): explicit narrowing over facet meta
  - Replaced optional-chaining on meta[name] include/exclude with a local object guard and array checks in facets.ts.
  - Next: clean snap/handlers and snap/safety “??/?.\*” cases; then patch diagnostics/service once the patch facet is enabled.

- Facets: focus next lint group (snap + patch)
  - Enabled patch facet and kept snap facet enabled to surface remaining lint errors in those areas next thread.
  - Disabled overlay facet (lint pass complete) to minimize archive size.
  - Next: resolve lint in src/cli/snap/_, src/runner/snap/_, and src/runner/patch/\*.

- Lint (snap + patch facets): remove unnecessary coalescing/optional chaining
  - src/cli/snap/handlers.ts: replaced “?? {}” fallbacks with guarded Object.values().
  - src/cli/snap/safety.ts: removed optional call on guaranteed resolver.
  - src/runner/patch/diagnostics.ts: dropped unnecessary optional-chains on a non-nullish param; kept safe chaining for optional subfields.
  - src/runner/patch/service.ts: removed “ops?.length ?? 0”, “cfg.stanPath ?? '.stan'”; normalized js=null to undefined for diagnostics.
  - src/runner/snap/capture.ts: removed redundant “??” on required SnapState field.
  - src/runner/snap/snap-run.ts: simplified condition flagged as always-falsy.

- CLI: static import sweep; remove test-driven fallbacks
  - src/cli/init.ts: replaced dynamic resolver with static named imports; removed duplicate safety fallbacks (kept applyCliSafety idempotent).
  - src/cli/snap/index.ts: static imports for action and undo/redo/set/info handlers; removed loader indirections; deleted handlers.ts.
  - src/cli/index.ts: static named imports (applyCliSafety, tagDefault, registerInit/Run/Snap/Patch, getVersionInfo); removed root resolvers and dynamic version import.
  - src/cli/patch/index.ts: removed default‑export shim; retain named export only.
  - vitest.config.ts: preferred pool 'threads' and removed cross‑package tar mock scaffolding (server.deps.inline, mock‑tar setup); kept test setup for process/cwd safety.
  - Docs: added import/export policy — “static named imports only; no dynamic import resolvers; no default‑export shims.”
  - Production hardening preserved: cancel/archive cleanup loops, PATH augmentation, live UI thresholds, prompt materialization, overlay selection behavior unchanged.

- Fix test flake: hoist guard exports to functions to avoid SSR “is not a function” under Vitest
  - Converted checkCancelNow, yieldAndCheckCancel, settleAndCheckCancel, and preArchiveScheduleGuard in src/runner/run/session/run-session/guards.ts from const‑arrow exports to function declarations (hoisted). No behavior change; resolves the failure in run plan header test.

- Fix overlay flow: remove missing loader shim; static import + strong typing
  - Replaced the dynamic loader import in src/cli/run/action/overlay-flow.ts with a static named import of buildOverlayInputs from ./overlay.
  - Introduced a concrete ResolvedOverlayForRun return type and used it in the run action to eliminate unsafe‑any destructuring and member access.
  - Result: fixes TS2307 (“Cannot find module './loaders'”) across typecheck/build/docs/tests; resolves eslint no‑unsafe‑\* violations in overlay‑flow and run action; knip “unused/Unresolved imports” clears (overlay.ts now referenced).

- Remove test-only fallbacks: namespaced config and default-export shims
  - Updated src/cli/patch.help.defaults.test.ts to write a namespaced config (stan-core/stan-cli), eliminating the legacy root cliDefaults fallback path from the test.
  - Removed default-export shims used only for SSR/tests: • src/cli/run/action/index.ts (defaultRegisterRunAction) • src/cli/run/derive/index.ts (deriveRunParametersDefault)
  - Outcome: single canonical named exports, static imports only; help default suffix still printed via canonical loader; all tasks remain green.

- CLI fall‑through cleanup: static imports only; remove test‑only shims
  - Replaced dynamic “named‑or‑default” resolvers in the run options registrar with static named imports:
    - src/cli/run/options.ts now imports applyCliSafety, runDefaults, and tagDefault directly from cli‑utils.
  - Removed the unused dynamic root resolver shim:
    - Deleted src/cli/root/resolvers.ts and updated subcommand wiring to use local minimal types.
  - Replaced dynamic loader in patch registrar with a static import:
    - src/cli/patch/register.ts now imports runPatch directly from '@/runner/patch/service'.
  - Outcome: eliminates fall‑throughs and shims that existed only for SSR/tests; aligns with the policy “static named imports only; no dynamic import resolvers; no default‑export shims.” Runtime behavior unchanged. Tests, lint, typecheck, build, docs, and knip remain green.

- Default-export shims: removed remaining defaults in CLI
  - src/cli/init.ts: removed default export wrapper in favor of named export only.
  - src/cli/run-args.ts: removed default export object; keep named deriveRunInvocation only.
  - src/cli/apply.ts: removed default export object; keep named exports.
- Plan maintenance: ingested handoff, pruned stale Next up items after confirming CI green, and aligned Next up with audit/CI/snapshot tasks for the next turn.

- DRY: Commander safety and defaults; snap/patch help defaults; loop guard reuse
  - Replaced local safety wrappers in patch and snap with cli-utils.applyCliSafety; removed src/cli/patch/safety.ts and src/cli/snap/safety.ts.
  - Added getOptionSource and snapDefaults to cli-utils; snap action/options now reuse centralized helpers; patch help suffix now uses cli-utils.patchDefaultFile.
  - Snap action now reuses the run loop header guard (removed duplicate inline guard).
  - Overlay flow now imports centralized getOptionSource.
  - No runtime behavior changes; cleans duplication and simplifies test maintenance.

- Patch registrar: fix default‑file resolution and missing imports
  - Removed ad‑hoc references to findConfigPathSync/loadCliConfigSync in src/cli/patch/register.ts that caused typecheck/build/docs failures.
  - Action now uses centralized cli‑utils.patchDefaultFile (honors --no-file) and no longer references missing symbols.
  - Help “(DEFAULT: …)” suffix remains computed at registration time via patchDefaultFile; displays correctly in tests.
  - Added resilient fallback in cli-utils.patchDefaultFile: when the strict loader is unavailable or returns no value, parse stan.config.\* directly (namespaced first; legacy root).
  - Outcome: fixes three failing tests (patch help default and both patch subcommand cases) and clears TypeScript/rollup/typedoc errors.

- DRY utilities: unify string helpers and remove duplicate util module
  - Added toStringArray and dedupePreserve to src/cli/cli-utils.ts for shared use.
  - Refactored src/cli/run-args.ts and src/cli/run/action/overlay-flow.ts to use the shared helpers.
  - Removed src/cli/run/action/util.ts (now redundant); updated imports accordingly.
  - Outcome: reduced duplication across selection parsing paths and simplified future maintenance.

- Run action robustness: guarded CLI config load
  - Wrapped loadCliConfigSync with a raw-config fallback (namespaced first, legacy root) in src/cli/run/action/index.ts.
  - Outcome: extra resilience for SSR/mock edge shapes without reintroducing dynamic import shims; no behavior change in normal runtime.

- Lint cleanup (cli-utils): escaped “>” in TSDoc normalizeArgv example and removed an unnecessary optional chain in patchDefaultFile legacy fallback; lint task green.

- Fix export regression (cli-utils): restored getOptionSource export used by snap/action and run/action overlay flow; resolves TS2305, unsafe call/return lint errors, and snap stash test runtime “not a function” failure.

- Snap header and loop state: show “snap” (not “run”) and record last=snap
  - Added snapLoopHeaderAndGuard in src/cli/run/action/loop.ts mirroring the run guard.
  - Updated src/cli/snap/action.ts to use the snap-specific guard so “stan snap” prints “▣ snap (last command: …)” and updates the loop state correctly without affecting script execution or snapshot behavior.

- Patch UX: de‑duplicate “patch source” log and show intended target on failure
  - Removed the duplicate “stan: patch source: …” log from src/runner/patch/service.ts; the CLI action remains the sole source so the line prints exactly once.
  - Unified‑diff failure messages now include the intended target when detectable (e.g., “stan: ✖ patch failed -> path/to/file.ts” and “stan: ✖ patch check failed -> path/to/file.ts”).
  - No change to File Ops or mixed‑payload diagnostics (multi‑target).

- Snap CLI confirmation: print “stan: snapshot updated”
  - Added an explicit confirmation log after a successful `stan snap` so local builds match the published CLI behavior.
  - Updated the stash success test to assert the new confirmation line in addition to existing stash logs.

- Patch tests: single “patch source” log across sources
  - Extended clipboard and file tests to assert exactly one “stan: patch source: …” line.
  - Added an argument-flow test to assert a single “stan: patch source: argument” and a terminal status.

- Patch tests: failure tail “-> <path>” for apply and check
  - Added tests that pass minimal invalid diffs via argument to verify the failure message tail for both normal and --check paths (e.g., “patch failed -> src/foo.ts”).

- Lint (TSDoc): escape greater-than in snap action
  - Escaped “>” in the TSDoc comment of src/cli/snap/action.ts to satisfy tsdoc/syntax.
