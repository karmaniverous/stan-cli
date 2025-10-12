# STAN Development Plan

This plan tracks near‑term and follow‑through work for the stan‑core engine only. CLI/runner tasks are managed in the stan‑cli repository.

---

## Next up (priority order)

- Docs (namespaced model only)
  - Update README and examples to show the namespaced `stan-core`/`stan-cli` layout exclusively.
  - Add a brief migration note pointing users to “stan init” (CLI).

- Config tests (strict engine loader)
  - Add a unit test that rejects unknown keys inside `stan-core` (negative case).
  - Add a JSON-path variant of the missing-section error.

- Typedoc (zero warnings)
  - Resolve the remaining AttemptCapture warning by exporting the type or adjusting the reference.

- DRY test scaffolding
  - Introduce shared `writeStanConfigYaml/Json` and `withMockTarCapture` helpers.
  - Adopt incrementally in a few suites.

- Optional DRY set (later)
  - Hoist additional small shared helpers if duplication appears during CLI alignment.
  - Keep modules ≤ 300 LOC.

---

## Completed (recent)

- Core — implemented strict namespaced loader
  - `loadConfig`/`loadConfigSync` now read only the top‑level `stan-core` section and fail fast when missing (friendly message).
  - `configSchema` is strict inside `stan-core` (unknown keys rejected); minimal fields only.
  - Removed CLI normalization from core (`normalizeCliDefaults`, `CliDefaults` types) and fixed TSDoc “\>” escapes to satisfy lint.
  - Updated tests to write `stan-core` namespaced configs for JSON/YAML; added a missing‑section error case.
  - Keeps STAN functional during release sequencing; no root‑object fallback in core.

- Interop housekeeping — prune resolved notes (config swing)
  - Removed resolved interop messages under `.stan/interop/stan-cli/` now that CLI has adopted top‑level namespacing:
    - `20251010-000000Z-core-config-slimming-and-cli-config.md`
    - `20251011-000000Z-config-namespacing-switch.md`
  - This enables stan-cli to drop imports of core interop threads and keeps archives lean.
  - Current state:
    - Core: strict `stan-core` loader in place; tests/docs aligned.
    - CLI: strict `stan-cli` loader adopted with a short transitional legacy extractor to keep the loop green during sequencing (per CLI requirements).
  - Follow‑through: remove any remaining transitional acceptance paths once both packages are fully released on the namespaced model.

- DRY set 1 — shared helpers and micro‑consolidations (no behavior changes)
  - File Ops: introduced a shared extractor at `src/stan/patch/common/file-ops.ts` and updated both the File Ops parser and the response validator to use it.
  - Repo paths: added `src/stan/path/repo.ts` with `normalizeRepoPath`, `isAbsolutePosix`, `toPosix`, and `resolveWithin`. File Ops parser and validator now share the same safety rules.
  - jsdiff writes: replaced ad‑hoc mkdir logic with the existing `ensureParentDir` helper for both repo and sandbox targets.
  - Archive composition: centralized inclusion of `<stanPath>/output` via `composeFilesWithOutput` in `src/stan/archive/util.ts`; used by archive and diff.
  - Tests: no behavior changes expected; kept coverage stable.

- DRY set 2 — diff/EOL/config helpers and polish (no behavior changes)
  - Added `src/stan/patch/common/diff.ts` (isUnifiedDiff/extractFirstUnifiedDiff/normalizePatchText); refactored `clean.ts` and `detect.ts` to use it.
  - Added `src/stan/text/eol.ts` (toLF/ensureFinalLF); `assemble.ts` now imports `toLF` instead of a local function.
  - Validator now imports `toPosix` from `src/stan/path/repo.ts` and removes a duplicated doc line.
  - Archive warnings surfaced via `surfaceArchiveWarnings` in `src/stan/archive/util.ts`; used by archive and diff.
  - Config loader uses shared helpers in `src/stan/config/common.ts` (formatZodError/parseRoot/normalizeImports) to reduce duplication.
  - Tests remain green; no public API changes.

- Docs — alignment with namespaced engine config and env switches
  - README: updated config section to reference the top‑level `stan-core` block and replaced outdated `cliDefaults/scripts` references with the minimal engine `ContextConfig` fields (`stanPath`, `includes`, `excludes`, `imports`).
  - New ENVIRONMENT.md: enumerates all environment variables observed by the engine, test harness, and release scripts (scope/values/examples).
  - typedoc.json: added ENVIRONMENT.md to `projectDocuments` so the page is published with the generated site.

- Typedoc — zero warnings
  - Re‑exported `AttemptCapture` from the patch barrel so Typedoc includes the referenced type used by `ApplyResult.captures`.
