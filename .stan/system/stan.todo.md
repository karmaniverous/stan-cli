# STAN Development Plan

Note: Keep changes cohesive and high-signal. Resolve as many related issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Use dependency graph mode (`.stan/context/dependency.state.json`) to stage the library entrypoint (`src/index.ts`) and downstream exported declarations; add missing TSDoc until `typedoc` passes (ignore pure barrels).
- Coordinate with `stan-core` on context-mode `stan snap` using `dependency.map.json` as an optional hash fast-path (core-owned change).
- Consider release prep for the breaking CLI behavior change (changelog/versioning) once you’re satisfied with the docs and test coverage.

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