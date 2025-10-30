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

- Decompose run derive module (smaller files; stable import path)
  - Replaced monolith src/cli/run/derive.ts with a directory module:
    - derive/index.ts (composition)
    - derive/run-defaults.ts (SSR‑robust defaults)
    - derive/dri.ts (named‑or‑default resolver)
    - derive/types.ts (local shapes). Existing imports of "../derive" continue to work.

- Decomposition follow‑through — path fixes
  - src/cli/run/derive/dri.ts: fix relative import to ../../run-args.
  - src/cli/run/derive/run-defaults.ts: fix relative import to ../../cli-utils.
