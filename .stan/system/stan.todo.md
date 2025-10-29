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

- Snap — write diff snapshot before capture
  - handleSnap now writes/refreshes <stanPath>/diff/.archive.snapshot.json (via core writeArchiveSnapshot) before saving to history, fixing empty/invalid snapshot in SSR/CI.
  - SSR-robust dynamic resolution of core helpers (named/default).

- Snap -s gating — stash must succeed before snapshot/history
  - handleSnap attempts `git stash -u` first; aborts early on failure (no snapshot, no history changes).
  - Pops stash best‑effort after capture.

- Snap history — normalize legacy 1‑based index on read
  - readState converts plausible 1‑based persisted indices to 0‑based; clamps otherwise.
  - Fixes off‑by‑one when navigating with `snap set/undo/redo` across legacy states.

- Snap capture resolver — expand SSR shapes
  - src/runner/snap/snap-run.ts now accepts named export, default object property, default-as-function, nested default.default, module-as-function, and scans default object properties to robustly resolve captureSnapshotAndArchives under SSR/mocks.
  - Fixes flakey “captureSnapshotAndArchives not found” in snap.stash.success.

- Snap history path — prefer configured path, then legacy probes
  - Reverted selection to: configured stanPath (when present) → 'stan' → '.stan' → configured fallback, matching test expectations and eliminating lingering off‑by‑one after `snap set 0`.
  - File: src/runner/snap/history.ts.

- Snap CLI handler — expand SSR shapes for handleSnap
  - loadSnapHandler now tolerates function‑as‑default, default.default, module‑as‑function, and scans default objects for callable properties; applies the same to barrel fallback.
  - Fixes “handleSnap not found” under exotic test mocks; removes an unused import in history.ts.
