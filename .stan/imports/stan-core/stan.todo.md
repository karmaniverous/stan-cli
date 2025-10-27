# STAN Development Plan

This plan tracks near‑term and follow‑through work for the stan‑core engine only. CLI/runner tasks are managed in the stan‑cli repository.

---

## Next up (priority order)

- Optional DRY set (later)
  - Hoist additional small shared helpers if duplication appears during future work or CLI alignment.
  - Keep modules ≤ 300 LOC.

---

## Completed (recent)

- Test stability + lint config: classifier resolver and Prettier config
  - Resolved a Vitest SSR hazard by resolving `classifyForArchive` at action time using a named‑or‑default dynamic import pattern in both archive and diff paths.
  - Converted `eslint-config-prettier` to a static import in `eslint.config.ts` (no need for dynamic import).
  - Integrated an engine‑focused “SSR/ESM test‑stability” section into the project prompt to codify these patterns.
  - Outcome: fixes “classifyForArchive is not a function” in `src/stan/archive.test.ts`; preserves runtime behavior; keeps engine presentation‑free.

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
