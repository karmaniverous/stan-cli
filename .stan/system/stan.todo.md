# STAN Development Plan

## Next up (priority order)

- Lint remediation (strict typed rules)
  - Sweep remaining “no-unnecessary-condition” and unnecessary optional chaining.
  - Eliminate unnecessary optional chaining and “no-unnecessary-condition” cases; simplify truthiness checks.
  - Fix tests flagged by require-await (drop async or add awaited ticks) and add at least one assertion where required.
  - Avoid non-null assertions in tests; prefer guarded access or expect().toBeDefined().
  - Iterate: npm run lint:fix, then npm run lint; keep changes in small, reviewable chunks.

- Knip follow-up (cosmetic)
  - Validate @humanwhocodes/momoa presence (typedoc/eslint types). If no longer required after lint pass, remove; otherwise annotate as intentionally retained.

---

## Completed (append-only, most recent items last)

- Snap capture resolver — expand SSR shapes
  - src/runner/snap/snap-run.ts now accepts named export, default object property, default-as-function, nested default.default, module-as-function, and scans default object properties to robustly resolve captureSnapshotAndArchives under SSR/mocks.
  - Fixes flakey “captureSnapshotAndArchives not found” in snap.stash.success.

- Snap history path — prefer configured path, then legacy probes
  - Reverted selection to: configured stanPath (when present) → 'stan' → '.stan' → configured fallback, matching test expectations and eliminating lingering off‑by‑one after `snap set 0`.
  - File: src/runner/snap/history.ts.
