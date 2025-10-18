# STAN Development Plan

This plan tracks near‑term and follow‑through work for the stan‑core engine only. CLI/runner tasks are managed in the stan‑cli repository.

---

## Next up (priority order)

- Optional DRY set (later)
  - Hoist additional small shared helpers if duplication appears during future work or CLI alignment.
  - Keep modules ≤ 300 LOC.

---

## Completed (recent)

- Docs — add Typedoc examples for anchors parameter
  - Added @example snippets to:
    - `createArchive` (src/stan/archive.ts)
    - `writeArchiveSnapshot` and `createArchiveDiff` (src/stan/diff.ts)
    - `filterFiles` options (src/stan/fs.ts)
  - Clarifies anchor precedence and usage; code behavior unchanged.

- Tests — adopt writeStanConfigYaml in config suites
  - Replaced ad‑hoc config materialization with `writeStanConfigYaml` in:
    - `src/stan/config.discover.test.ts`
    - `src/stan/config.load.extra.test.ts` (valid YAML case)
    - `src/stan/config.test.ts` (YAML case)
  - Negative‑path tests (unknown keys/missing section) remain manual to assert error behavior. No production behavior changes.

- Tests — fix tar mock hoisting in withMockTarCapture
  - Resolved ReferenceError by avoiding closure capture inside a hoisted vi.mock factory.
  - Introduced a hoisted `state.body` and updated the mock to write that content; the helper now sets `state.body` per suite.

- Tests — adopt shared tar capture helper in archive/diff suites
  - Replaced ad‑hoc vi.mock('tar') blocks with the shared `withMockTarCapture` in:
    - `src/stan/archive.test.ts`
    - `src/stan/archive.classifier.behavior.test.ts`
    - `src/stan/diff.combine.behavior.test.ts`
    - `src/stan/run.combine.archive.behavior.test.ts`
    - `src/stan/diff.classifier.behavior.test.ts`
  - No production behavior changes; keeps test setup concise and uniform.

- Core — helper + docs for facets overlay
  - Exported `makeGlobMatcher(patterns: string[]): (rel: string) => boolean` and documented selection precedence (includes/excludes/anchors and reserved denials) in README for engine‑parity matching.

- Core — implemented anchors channel in selection surfaces
  - `filterFiles` accepts `anchors?: string[]` and re‑includes matches after excludes/.gitignore while respecting reserved denials (`.git/**`, `<stanPath>/diff/**`, `<stanPath>/patch/**`) and output exclusion when `includeOutputDir=false`.
  - `createArchive`, `createArchiveDiff`, and `writeArchiveSnapshot` accept and propagate `anchors` to ensure consistent selection across full, diff, and snapshot.

- System — facet‑aware editing guard (prompt update)
  - Added a new system part describing a two‑turn cadence when a target lies under an inactive facet:
    - Turn N: enable the facet (state patch) and log intent; no content patch for hidden targets.
    - Turn N+1: emit the actual edits after re‑run with `-f <facet>` (or `-F` to disable overlay).
  - Clarifies allowed mixing (other visible patches OK; anchors OK) and reiterates reserved denials.
