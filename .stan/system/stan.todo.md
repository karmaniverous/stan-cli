# STAN Development Plan

Note: Aggressively enable/disable facets to keep visibility on current work while minimizing archive size. Resolve as many issues per turn as possible. No nibbles — take big bites.

## Next up (priority order)

- Fix facet flag semantics (breaking change OK):
  - Make `-f/--facets` and `-F/--no-facets` boolean-only (no optional args) to eliminate Commander bundling ambiguity (`-FS` == `-F S`).
  - Add `--facets-on <names...>` and `--facets-off <names...>` as explicit per-run overrides (Option Y: explicit wins; do not auto-suspend explicit deactivations).
  - Ensure `--no-facets` is interpreted correctly (Commander stores it as `options.facets = false` with source `facets: cli`).
- Make DIFF honor anchors (2B) while keeping DIFF “changed-only”:
  - Pass anchors into the diff archive selection (subject to reserved denials) so gitignored-but-important state like `.stan/system/facet.state.json` can appear in diffs when it changes.
  - Ensure baseline snapshot selection includes `.stan/system/facet.state.json` when archiving so it doesn’t continually appear as “new”.
- Archive visibility:
  - Keep `.stan/system/facet.state.json` always included in full archives even when gitignored.
  - Ensure `.stan/system/facet.state.json` appears in diff archives when changed since the snapshot (or once as “added” when first introduced to the snapshot baseline).
- Add/adjust tests:
  - CLI parsing: `-FS` must behave the same as `-F -S`; `--no-facets` must disable overlay.
  - Archive behavior: facet state present in full; present in diff when changed.
- Update docs (`docs-src/cli-examples.md`, `docs-src/archives-and-snapshots.md`) to reflect new facet flags and diff/anchor behavior.

## Completed (context essentials only)

**CRITICAL: Append-only list. Add new completed items at the end. Prune old completed entries from the top. Do not edit existing entries.**
