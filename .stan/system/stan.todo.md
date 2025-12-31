# STAN Development Plan

Note: Aggressively enable/disable facets to keep visibility on current work while minimizing archive size. Resolve as many issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Fix facet overlay semantics to match “tests are a filter”:
  - Remove/disable any overlay logic that generates scoped anchors intended to re-include leaf-glob patterns (this currently causes tests to appear in otherwise-disabled structural facets).
  - Ensure leaf-glob patterns from inactive filter facets are applied only as engine excludes (deny-list), and never as anchors.
- Fix nested structural facet behavior (A contains B):
  - Replace the current subtree overlap “drop inactive root when overlaps active root” tie-breaker with a carve-out mechanism that can express “B on, rest of A off”.
  - Implement via on-disk enumeration of immediate children under inactive roots and excluding non-protected children (bounded and stable enough for CLI usage).
- Add/adjust tests to lock in the four nested-facet scenarios plus filter behavior:
  - Cover A/B include/exclude combinations and confirm that enabling the tests filter does not surface tests inside structurally-disabled subtrees.
  - Add a regression test for the specific A/B/T scenario described in this thread.
- Consider release prep for the breaking facet flag change (changelog/versioning) once you’re satisfied with the docs and test coverage.
- (Optional) Expand integration coverage to also assert “new anchored file appears once” behavior when it’s absent from the snapshot baseline.

## Completed (context essentials only)

**CRITICAL: Append-only list. Add new completed items at the end. Prune old completed entries from the top. Do not edit existing entries.**

- Implement breaking facet flag redesign: `-f/-F` boolean-only and add `--facets-on/--facets-off` (per-run only).
- Fix overlay enablement: interpret `--no-facets` as `options.facets=false` with source `facets: cli` and disable overlay correctly.
- Make DIFF honor anchors by passing `anchors` into the diff config (changed-only semantics via snapshot).
- Enforce Option Y in overlay calc: do not autosuspend explicit per-run deactivations; also anchor `.docs.meta.json`.
- Update docs to match new facet flags; add regression tests for `-FS` parsing and `--no-facets` behavior.
- Amendment: fix `facets.flags.parse.test.ts` lint errors and accept the current plan-only message variant so the `-FS` regression test passes.
- Fix lint/test fallout from facet flag change; silence `tsdoc/syntax` @jsx warning (lint+tests green).
- Verify guides reflects facet flag breaking change and “diff anchors changed-only” policy (no further doc patches needed).
- Add integration test proving anchored gitignored state appears in diff only when changed vs snapshot.
- Add missing TypeDoc comments for exported config/run types (silence `notDocumented` warnings).
- Export `ScriptObject` from `src/index.ts` so TypeDoc includes it when documenting `ScriptEntry`.
- Add `guides/stan-assistant-guide.md` (assistant integration guide).
- Documentation pass: align guides with namespaced config, diagnostics, and add cross-links.
- Gitignore `<stanPath>/imports/` by default and implicitly include `<stanPath>/imports/**` in snapshots/archives so diffs reflect import changes without config includes.
- Requirements updated: declare leaf-glob facets (tests) as filters and require nested structural facet carve-outs (no anchor-based leaf-glob re-inclusion).