# STAN Development Plan

Note: Keep changes cohesive and high-signal. Resolve as many related issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Stage DRY hotspots into the thread context via `.stan/context/dependency.state.json` (archive-stage + CLI config modules) to prepare for refactor.
- Ensure `makeBaseConfigs` propagates `dependency` context correctly (already partially addressed, verify).
- Resolve the TypeDoc warning by exporting/documenting the missing symbol(s) referenced from the public API (do not silence TypeDoc validation).
- DRY pass: identify duplication hotspots (CLI command registration, option wiring, config loading/peek/raw, run defaults merging, named-or-default dynamic import patterns in SSR paths).
- Long-file scan: collect `wc -l` for `src/**/*.ts` and propose decompositions for anything >300 LOC before refactoring those modules further.
- After each DRY extraction: update/co-locate tests to pin behavior (especially SSR/Vitest fork ordering) and keep diffs small enough to review.
- Continue TypeDoc/TSDoc sweep via dependency graph mode (`.stan/context/dependency.state.json`) once the DRY refactor target area is stable (ignore pure barrels).- Coordinate with `stan-core` on context-mode `stan snap` using `dependency.map.json` as an optional hash fast-path (core-owned change).
- Consider release prep (changelog/versioning) once refactors and docs/test coverage are stable.

## Completed (context essentials only)

**CRITICAL: Append-only list. Add new completed items at the end. Prune old completed entries from the top. Do not edit existing entries.**

- Make repo ESM-only: update rollup config (drop CJS) and package.json exports.
- Verified ESM-only build/exports and full CI suite (build/docs/knip/test/lint/typecheck passed).
- Refactored documentation to enforce the "Run -> Snap -> Patch" loop model, emphasizing "Run" as the save point and "Patch" as the intelligence center.
- Implemented `-w/--workspace` support (fast-glob dependency, root option registration, and pre-action context switching).
- Updated documentation (cli-examples, configuration, assistant-guide) to cover `-w/--workspace`.
- Removed requirement for swappable core (unused feature).
- Standardized documentation to consistently use "Run/Snap/Patch" terminology (guides/case-studies/rrstack.md, guides/cli-examples.md, guides/tutorial-quickstart.md).
- Fix `typecheck` error in `src/cli/run/options.ts` by exposing `context` in `runDefaults` (cli-utils).
- Refactor `DependencyContext` to use inferred types from `stan-core` (remove `any`).
- Fix `onSelectionReport` type error in `archive/phase.ts` using safe parameter casting instead of `any`.
- Export `DependencyContext` from `src/runner/run/index.ts` to resolve TypeDoc warning.
- Removed `--meta` run option; meta archive is created on every context-mode run.
- Updated docs/requirements to match the no-`--meta` context-mode contract.
- Added stan-core interop note requesting snap hash fast-path from dependency.map.json.
- Updated `stan run -c` implementation to support dependency context v2 (map/meta split, write map file).
- Updated docs to remove `--meta`, document `archive.meta.tar`, and fix `-b` (combine) vs `-c` (context) flag references.
- Added TSDocs to `DependencyContext` and exported `DependencyMetaResult` (hidden) to resolve TypeDoc warnings.
- Excluded `typescript` from the Rollup bundle to prevent `__filename` runtime errors in the CLI.
- Externalized all production dependencies in Rollup to ensure `stan-core` asset resolution works correctly in global installs.
- Fixed `stan run -c` logic to preserve `archive.meta.tar` by pre-cleaning the output directory and disabling the runner's internal cleanup.
- Refactored context mode to support `--meta` flag: replaces `archive.tar` with meta content and skips diffs; removed unconditional `archive.meta.tar`.
- Fixed test regression in `config.test.ts` and sent interop message to `stan-core`.
- Corrected documentation to remove `archive.meta.tar` and describe `-m` meta-archive substitution.
- Fixed live UI to skip "archive (diff)" row when running with `--meta`.
- Sent `stan-core` interop note: meta archive mislabeled as full in live UI; propose system-prompt guardrails to force dependency-meta/state-driven context acquisition (avoid web search for in-repo code).
- Removed deprecated faceting feature mentions and deleted facet system files.
- Sent stan-core interop note: dependency graph mode activation should be thread-sticky (diff-only turns omit unchanged dependency meta).
- Added initial dependency state selection to stage public API modules for TypeDoc coverage work.
- Seeded `.stan/context/dependency.state.json` for the TypeDoc/TSDoc documentation sweep (public API + immediate deps).
- Fixed archive progress/UI labeling so meta-mode runs display `archive` item `meta` and logger prints `archive (meta)`.
- Refined archive composition rules: standard run excludes dependency artifacts; meta run resets state + includes state in archive + skips diff; context run skips full archive.
- Refactored `src/cli/cli-utils.ts` (junk drawer) into `cli/lib/commander.ts`, `cli/config/defaults.ts`, and `cli/util/collection.ts`; updated all consumers.
- Fixed typecheck errors in `src/cli/config/defaults.ts` (export rename) and `src/cli/lib/commander.ts` (TSDoc syntax).
- Fixed lint error (unnecessary conditional) in `src/cli/index.ts` by removing redundant null check on `readRootDefaultsFromConfig` result.
- Collected long-file scan (all `src/**/*.ts` < 300 LOC); cleared decomposition gate for DRY refactor.
- Seeded `.stan/context/dependency.state.json` to load DRY hotspots (archive-stage + CLI config) for the next refactor pass.
- Added `src/test/smoke/archive-context.test.ts` to validate archive composition and dependency state inclusion in diffs.
- Removed `src/runner/run/control.ts` and restart logic from the live console (q/r keys); usage now relies on Ctrl-C.
- Updated archive composition (Option B) and snapshot baselines: `stan run --context` writes FULL+DIFF; `stan snap` updates both standard and context snapshots; smoke tests extended.
- Fixed `snap.overlay.snapshot.test.ts` mock for robust dynamic import handling and enabled `archive-context.test.ts` smoke test.
- Updated smoke test runner to pass `--tsconfig` to `tsx`, ensuring path alias resolution in the child process.
- Updated `vitest.config.ts` to inline `@karmaniverous/stan-core` and `tar`, ensuring `vi.doMock` applies correctly in unit tests.
- Fixed `patch.test.ts` to simulate failure codes correctly when testing failure paths, and ensured `snap.overlay.snapshot.test.ts` resets modules before mocking.
- Updated `cli-examples.md`, `stan-assistant-guide.md`, and `stan.requirements.md` to reflect removal of q/r keys.
- Fixed type cast and removed `vi.restoreAllMocks()` in `snap.overlay.snapshot.test.ts` to prevent mock reset issues.
- Reverted `snap.overlay.snapshot.test.ts` to `vi.doMock` with strict `vi.resetModules` per-test to fix persistence/resolution issues and resolve lint errors.
- Seeded dependency state for TypeDoc warning triage and sent a `stan-core` interop note to tighten prompt rules so `--context` exploration uses `dependency.state.json` by default.
- Added standalone smoke test script `scripts/smoke-context-diff.ts` to exercise context-mode archives/diffs without Vitest.