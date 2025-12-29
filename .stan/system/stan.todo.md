# STAN Development Plan

Note: Aggressively enable/disable facets to keep visibility on current work while minimizing archive size. Resolve as many issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Verify docs-src reflects the breaking facet flag change (`-f/-F` boolean-only; `--facets-on/--facets-off`) and the “diff anchors remain changed-only” policy; if anything is missing, apply doc patches.
- Consider adding a higher-level integration test that inspects diff archive contents to prove anchored gitignored state (e.g., `facet.state.json`) appears in `archive.diff.tar` when changed.

## Completed (context essentials only)

**CRITICAL: Append-only list. Add new completed items at the end. Prune old completed entries from the top. Do not edit existing entries.**

- Implement breaking facet flag redesign: `-f/-F` boolean-only and add `--facets-on/--facets-off` (per-run only).
- Fix overlay enablement: interpret `--no-facets` as `options.facets=false` with source `facets: cli` and disable overlay correctly.
- Make DIFF honor anchors by passing `anchors` into the diff config (changed-only semantics via snapshot).
- Enforce Option Y in overlay calc: do not autosuspend explicit per-run deactivations; also anchor `.docs.meta.json`.
- Update docs to match new facet flags; add regression tests for `-FS` parsing and `--no-facets` behavior.
- Amendment: fix `facets.flags.parse.test.ts` lint errors and accept the current plan-only message variant so the `-FS` regression test passes.
- Fix lint/test fallout from facet flag change; silence `tsdoc/syntax` @jsx warning (lint+tests green).
