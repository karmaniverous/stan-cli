# STAN Development Plan

## Next up (priority order)

- Derive follow‑through (run derive module)
  - Tighten types in src/cli/run/derive/index.ts; eliminate no‑unsafe‑assignment and error‑typed flows.
  - Enforce barrel usage for consumers (import from '../derive' only); remove any deep path imports.
  - Reconfirm SSR/mock paths for run‑args/cli‑utils with Vitest (forks pool).

- Run defaults & semantics (CLI)
  - getRunDefaults must prefer cli‑utils.runDefaults when available; otherwise parse stan.config.\* synchronously and merge over baselines; keep prompt/facets defaults.
  - Restore root.env.defaults and runner semantics: scripts true/false/array; -p prints plan only; -S -A prints “nothing to do”; archive=false honored.
  - Add focused tests where gaps are found.

- Cancellation matrix (guard race regressions)
  - Ensure archives are never created on cancel across live/concurrent and live/sequential; keep late‑cancel guards and settle timing stable.

- Overlay excludes mapping (facet composition)
  - Recheck facet overlay excludes/anchors propagation into RunnerConfig after recent changes; fix any propagation gaps.

- Legacy extract (transitional)
  - Exercise legacy engine detection under STAN_DEBUG=1; confirm debugFallback still fires; paths remain robust post‑split.

- Lint remediation (strict typed rules)
  - Resolve no‑unnecessary‑condition and unnecessary optional‑chaining in flagged files.
  - Address require‑await and unused vars in tests; remove accidental any flows.
  - Iterate: npm run lint:fix, then npm run lint; keep changes small and reviewable.

- CI/build/docs
  - Run build + typedoc; ensure dist/stan.system.md is copied; run knip and address any drift.

- Sanity/coverage
  - FULL includes facet.state.json; DIFF excludes anchors unless changed; confirm overlay metadata (.stan/system/.docs.meta.json) included and updated.

- Knip follow‑up (cosmetic)
  - Validate @humanwhocodes/momoa presence (typedoc/eslint types). If no longer required after lint pass, remove; otherwise annotate as intentionally retained.

---

## Completed (append-only, most recent items last)

- Overlay excludes mapping — honor explicit facet overrides
  - src/cli/run/action/overlay.ts: map engine excludes when overlay is enabled OR explicit per‑run facet overrides are provided (‑f/‑F names or naked ‑f), and propagate leaf‑globs under the same guard. Ensures subtree roots expand to "<root>/**" and leaf‑globs (e.g., "**/\*.test.ts") pass through as expected in CLI overlay mapping tests.

- Lint nibble — remove redundant nullish coalescing in derive loader
  - src/cli/run/action/loaders.ts: dropped “?? undefined” flagged by @typescript-eslint/no-unnecessary-condition (no behavior change).

- UI parity — stabilize immediate archive visibility after run
  - src/runner/run/session/run-session.ts: add a brief post‑archive settle (timeout + yieldToEventLoop) after archivePhase completes, before final flush/return. Improves cross‑platform stability for tests that assert presence of archive.tar and archive.diff.tar immediately after runSelected.

- Derive loader — expand SSR/mocks fallbacks to restore CLI run semantics tests
  - src/cli/run/action/loaders.ts: loadDeriveRunParameters now tolerates default.default, module-as-function, and scans default/top-level callable shapes (parity with other loaders).
  - Fixes deriveRunParameters resolution under Vitest SSR; unblocks runner.semantics.v2.

- Decompose run derive module (smaller files; stable import path)
  - Replaced monolith src/cli/run/derive.ts with a directory module:
    - derive/index.ts (composition)
    - derive/run-defaults.ts (SSR‑robust defaults)
    - derive/dri.ts (named‑or‑default resolver)
    - derive/types.ts (local shapes). Existing imports of "../derive" continue to work.

- Decomposition follow‑through — path fixes
  - src/cli/run/derive/dri.ts: fix relative import to ../../run-args.
  - src/cli/run/derive/run-defaults.ts: fix relative import to ../../cli-utils.

- Tests — derive loader fallbacks (SSR resilience)
  - Added src/cli/run/derive/resolve.test.ts to exercise resolveDRI against default-shaped modules (function-as-default and default object property).
  - Locks the SSR fallback behavior for derive loader resolution.

- Tests — overlay excludes mapping (naked -f)
  - Added src/cli/runner.overlay.naked-f.test.ts to verify the “shouldMap” shortcut engages for naked -f (no names) while producing no engine excludes (all facets active → no hiding).

- Tests — fixes for derive resolver and naked -f overlay
  - src/cli/run/derive/resolve.test.ts: mock "../../run-args" (exact specifier used by dri.ts) via asEsmModule; remove invalid "void" casts; assert callability.
  - src/cli/runner.overlay.naked-f.test.ts: expect plan line "overlay: off" when global overlay is disabled; engineExcludes still empty under naked -f.

- Defaults — plan-only when scripts=false by default
  - src/cli/run/derive/index.ts: when cliDefaults.run.scripts=false and no CLI archive flag is provided, default archive to false to preserve v2 semantics.

- Prompt — export shape discipline (no doubled default+named)
  - Updated .stan/system/stan.project.md (SSR/ESM playbook) to explicitly prohibit exporting the same API as both default and named as an SSR workaround; mandate resolvers in tests/adapters instead.

- Lint nibble — remove unnecessary coalescing in derive
  - src/cli/run/derive/index.ts: replaced Object.keys(scripts ?? {}) with Object.keys(scripts) (scripts is non‑nullable in the signature).

- Lint sweep — optional chaining on non‑nullable values
  - src/runner/run/control.ts: replaced optional chaining on stdin/UI methods with explicit typeof guards (setRawMode/resume/on/off/removeListener/pause).
  - src/runner/run/session/run-session.ts: replaced optional chaining on UI hooks (prepareForNewSession/flushNow) and stdin.pause with typeof guards.
- Stability — SSR fallbacks for archive stage resolvers (no behavior change)
  - src/runner/run/session/archive-stage/imports.ts: accept default-as-function, module-as-function, and shallow default scans for archivePhase/stageImports.
