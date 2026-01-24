# STAN Development Plan

Note: Aggressively enable/disable facets to keep visibility on current work while minimizing archive size. Resolve as many issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Reorder `stan run -h` flags: place `--context`/`--no-context` immediately after `--no-archive`.
- Implement `--meta` (Bootstrap Mode) in CLI: implies context, skips scripts/full-archive, produces meta archive only.
- Consider release prep for the breaking facet flag change (changelog/versioning) once you’re satisfied with the docs and test coverage.

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
