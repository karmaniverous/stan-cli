# STAN Development Plan

This plan tracks near‑term and follow‑through work for the stan‑core engine only. CLI/runner tasks are managed in the stan‑cli repository.

---

## Next up (priority order)

- Optional DRY set (later)
  - Hoist additional small shared helpers if duplication appears during future work or CLI alignment.
  - Keep modules ≤ 300 LOC.

---

## Completed (recent)

- Patch engine — preserve leading dot in “.stan/…” creation paths
  - Fixed path normalization in jsdiff fallback and last‑resort creation fallback to strip only a literal “./” and preserve “.stan/...”.
  - Added focused tests:
    - src/stan/patch/jsdiff.newfile.dotstan.test.ts
    - src/stan/patch/run/pipeline.creation.dotstan.test.ts

- Tests — fix helper import ambiguity in config discovery test
  - Replaced the helper import with a local YAML write in src/stan/config.discover.test.ts to avoid an intermittent SSR import ambiguity under Vitest. Test intent and behavior unchanged; resolves the single failing test.

- Amendment: config discovery test — use writeFile directly
  - Replaced the undefined helper call with a direct writeFile in src/stan/config.discover.test.ts to fix TS2304 and lint errors.
  - No change in test intent; stabilizes typecheck/lint/build.

- Tests — stabilize SSR-sensitive imports in two suites
  - src/stan/archive.classifier.behavior.test.ts: dynamically import the tar mock helper inside beforeEach and reset captured calls there.
  - src/stan/patch/jsdiff.newfile.nested.test.ts: dynamically import applyWithJsDiff inside the test body to avoid cross‑suite mock effects.
