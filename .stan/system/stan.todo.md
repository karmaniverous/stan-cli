# STAN Development Plan

Note: Aggressively enable/disable facets to keep visibility on current work while minimizing archive size. Resolve as many issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Consider release prep for the breaking facet flag change (changelog/versioning) once you’re satisfied with the docs and test coverage.

## Completed (context essentials only)

**CRITICAL: Append-only list. Add new completed items at the end. Prune old completed entries from the top. Do not edit existing entries.**

- Make repo ESM-only: update rollup config (drop CJS) and package.json exports.
- Verified ESM-only build/exports and full CI suite (build/docs/knip/test/lint/typecheck passed).
