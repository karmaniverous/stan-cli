# STAN Development Plan

Note: Aggressively enable/disable facets to keep visibility on current work while minimizing archive size. Resolve as many issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Fix remaining `lint` errors (`unsafe-assignment`, `unsafe-argument`) in `src/cli/run/action/index.ts` and `src/runner/run/archive/phase.ts`.
- Consider release prep for the breaking facet flag change (changelog/versioning) once you’re satisfied with the docs and test coverage.

## Completed (context essentials only)

**CRITICAL: Append-only list. Add new completed items at the end. Prune old completed entries from the top. Do not edit existing entries.**

- Make repo ESM-only: update rollup config (drop CJS) and package.json exports.
- Verified ESM-only build/exports and full CI suite (build/docs/knip/test/lint/typecheck passed).
- Refactored documentation to enforce the "Run -> Snap -> Patch" loop model, emphasizing "Run" as the save point and "Patch" as the intelligence center.
- Implemented `-w/--workspace` support (fast-glob dependency, root option registration, and pre-action context switching).
- Updated documentation (cli-examples, configuration, assistant-guide) to cover `-w/--workspace`.
- Removed requirement for swappable core (unused feature).- Standardized documentation to consistently use "Run/Snap/Patch" terminology (guides/case-studies/rrstack.md, guides/cli-examples.md, guides/tutorial-quickstart.md).