# STAN Development Plan

When updated: 2025-10-13 (UTC)

This plan tracks near‑term and follow‑through work for the stan‑cli package (CLI and runner). The stan‑core split is complete; engine work is tracked in the stan‑core repository.

---

## Next up (priority order)

- Changelog / release notes
  - Document: prompt include‑on‑change behavior, DRY barrel removal, dynamic TTY detection, PATH augmentation note.
  - Cut next patch release once docs are updated.

- Deprecation staging for config ingestion
  - Phase 1: keep legacy extractor + loader fallback; emit debugFallback notices when used; changelog guidance to run “stan init”.
  - Phase 2: require STAN_ACCEPT_LEGACY=1 for legacy; otherwise fail early with a concise message (“Run ‘stan init’ to migrate config.”).
  - Phase 3: strict stan-cli only (remove legacy acceptance).

- Docs & help updates
  - Configuration: namespaced layout only; “Migration” appendix → “run stan init”.
  - Getting Started/CLI Usage: namespaced examples; note prompt flag and PATH augmentation (already covered).
  - Init help: mention migration and .bak/--dry-run.

- Silent fallback audit (narrowed to config/migration scope)
  - Ensure debugFallback is used on: legacy engine extraction; legacy CLI loader fallback; DEFAULT_STAN_PATH resolution.
  - Tests assert no debug output unless STAN_DEBUG=1 (behavior unchanged otherwise).

- Test follow‑through
  - Add small parity checks for include‑on‑change on Windows/POSIX (core|path sources).
  - Consider a quick unit around top‑level index exports to guard against accidental re‑introduction of barrel‑of‑barrel.

---

## Backlog / follow‑through

- Snapshot UX follow‑through
  - Improve `snap info` formatting (clearer current index marking; optional time‑ago column).

- Live UI niceties (post‑stabilization)
  - Optional Output column truncation to available columns (avoid terminal wrapping when paths are long).
  - Optional alt‑screen mode (opt‑in; disabled by default).

- Docs/site
  - Expand troubleshooting for “system prompt not found” and PATH issues with suggestions (`--prompt core`, install missing devDeps, or invoke via package manager). (ongoing)

- Live view debugging (graceful)
  - Explore an approach to surface debug traces alongside the live table without corrupting its layout (e.g., a reserved log pane, a toggleable overlay, or a ring buffer dumped on finalize). Aim to preserve readability and avoid cursor/control sequence conflicts.

---

## Acceptance criteria (near‑term)

- `stan run`:
  - `-m/--prompt` fully supported; `cliDefaults.run.prompt` honored. [DONE]
  - Early failure pathways print one concise error and do not run scripts/archives. [DONE]
  - Plan header prints `prompt:` line (except with `-P`). [DONE]
  - The system prompt is part of both full and diff flows; restoration occurs on completion/error; no gratuitous rewrites. [DONE]
  - Child PATH augmentation ensures repo‑local binaries resolve without globals across platforms/monorepos. [DONE]
- `stan snap`:
  - No drift/docs messages printed; snapshot behavior and history unchanged. [DONE]
- Config swing:
  - stan init migrates legacy → namespaced; backup + dry-run supported. [PENDING]
  - Legacy engine keys honored via synthesized ContextConfig during transition; debugFallback notice only. [PENDING]
  - Deprecation phases implemented (env‑gated, then strict). [PENDING]
- Tests/docs:
  - Migration tests (YAML/JSON/mixed; idempotent; backups; dry-run). [PENDING]
  - Transitional extraction tests (legacy excludes/includes honored). [PENDING]
  - Docs updated (namespaced examples; migration appendix; init help). [PENDING]

---

## Completed (recent)

- Prompt resolution (core fallback) — helper + tests scaffolded and integrated
  - Added src/stan/prompt/resolve.ts with primary engine helper + createRequire fallback (space‑safe).
  - Updated src/stan/run/prompt.ts to use the helper for ‘core’/‘auto’ resolution.
  - Added unit tests:
    - primary path when engine helper returns a readable file,
    - fallback path covering spaces in the resolved package root.
  - Added a plan‑level check to assert the prompt line prints “core” when local is absent.
  - Follow‑through: optional guarded STAN_DEBUG line; prune interop after merge; remove imports of stale core interop threads.

- DRY — version helper uses shared docs-meta reader
  - Replaced ad-hoc `.docs.meta.json` parsing in `src/stan/version.ts` with `readDocsMeta(...)` from `src/stan/system/docs-meta.ts` to centralize access and types.

- DRY — archive helpers consolidated
  - Extracted shared helpers to `src/stan/run/archive/util.ts`:
    - `stageImports()` (best‑effort wrapper around prepareImports),
    - `cleanupOutputsAfterCombine()` and `cleanupPatchDirAfterArchive()`.
  - Refactored callers in:
    - `src/stan/run/archive.ts`,
    - `src/stan/run/session/archive-stage.ts`.
  - Behavior unchanged; reduces duplication and centralizes best‑effort handling.

- Run — emit legacy engine notice once per action
  - Kept a single `run.action:engine-legacy` debugFallback emission in the run preAction hook; removed duplicate notices from the loader and run action.
  - Prevents duplicate logs while preserving the required test signal under `STAN_DEBUG=1`.

- Defaults — remove local DEFAULT_OPEN_COMMAND duplicate
  - Updated CLI config loader to import `DEFAULT_OPEN_COMMAND` from `@karmaniverous/stan-core` and deleted `src/cli/config/defaults.ts`.

- Tests — harden snap stash success teardown on Windows
  - Updated src/cli/stan/snap.stash.success.test.ts to pause stdin, add a short settle, and remove temp dirs via rmDirWithRetries. Prevents intermittent ENOTEMPTY on out/diff and eliminates the timeout.

- Run — guarantee engine-legacy debugFallback under STAN_DEBUG=1
  - Added a secondary `run.action:engine-legacy` debugFallback emission inside the CLI-config legacy fallback path when `stan-core` is absent at the top level.
  - Ensures tests observe the required notice alongside the existing `cli.config:loadSync` message.

- Init — force idempotency guard and legacy→namespaced migration
  - Guard now checks pre‑migration state: `--force` is a true no‑op only when the file was already namespaced.
  - Legacy configs are migrated to `stan-core`/`stan-cli` and written back (YAML/JSON), preserving unknown root keys and filename/format.
  - `.bak` is still written on migration; dry‑run remains non‑interactive and side‑effect free.

- Run — early legacy engine-config debugFallback
  - Added a `preAction` hook on the run subcommand to emit `run.action:engine-legacy` under `STAN_DEBUG=1` whenever the config lacks a top-level `stan-core` node.
  - Keeps the existing action‑time check; guarantees the notice is present alongside the CLI‑config legacy notice.

- Decomposed session orchestrator (directory + index.ts)
  - Replaced `src/stan/run/session.ts` with `src/stan/run/session/index.ts` (orchestrator ≤300 LOC).
  - Introduced `src/stan/run/session/types.ts`, `cancel-controller.ts`, and `scripts-phase.ts` to keep the orchestrator small and testable.
  - Existing helpers (`prompt-plan`, `archive-stage`, `signals`, `ui-queue`) reused intact.
  - Fixed a lingering test import (`src/stan/run/plan.test.ts`) to the run barrel.

- Snap tests — namespaced config alignment
  - Updated snapshot/selection tests to write a namespaced `stan.config.yml` (`stan-core` for engine keys; `stan-cli` for CLI keys).
  - Fixed failures caused by stan-core’s strict loader (“missing ‘stan-core’ section”) and a mismatched `stanPath` during history navigation.
  - Tests now target the correct `out/diff` state and pass deterministically under the new config model.

- Config interop swing
  - Requirements now codify namespaced ingestion, transitional legacy engine‑config extraction, and staged deprecation.
  - Ready to ask stan-core to prune resolved interop notes; remove our import of core interop files after core prunes them.

- Run — import debugFallback to restore debug notice path and fix typecheck/lint
  - Added `import { debugFallback } from '@/stan/util/debug'` in `src/cli/stan/run/action.ts`.
  - Resolves TS2304 (“Cannot find name 'debugFallback'”) and associated lint errors.
  - Unblocks tests that assert presence of the legacy‑config notice under `STAN_DEBUG=1`.

- Patch — use engine DEFAULT_OPEN_COMMAND (DRY)
  - Updated `src/stan/patch/service.ts` to import `DEFAULT_OPEN_COMMAND` from `@karmaniverous/stan-core`.
  - Removes dependency on the deleted local defaults module and fixes module‑resolution failures in tests.

- Run — guarantee early legacy-engine debugFallback once per action
  - Added an early check in `src/cli/stan/run/action.ts` to emit `run.action:engine-legacy` when the config lacks a top-level `stan-core`, guarded to avoid duplicates with the later synthesis path.
  - Ensures the expected debug signal is present under `STAN_DEBUG=1` for the transitional legacy extraction test.
  - Keeps the emission to a single notice per action by tracking a local guard.

- Run — honor legacy includes/excludes in archive phase
  - Extended `RunnerConfig` to optionally carry `includes`/`excludes`/`imports`.
  - In `run/action.ts`, populated these fields from the resolved engine `ContextConfig` (synthesized from legacy root keys when needed).
  - The archive phase now receives selection settings and respects legacy excludes without requiring a top‑level `stan-core` block.
  - No behavior change for namespaced configs; legacy paths only.

- Run/CLI config — guarantee engine-legacy notice in legacy CLI fallback
  - When the CLI loader falls back to legacy top-level keys (no `stan-cli`), also emit the `run.action:engine-legacy` debugFallback when `stan-core` is absent. This ensures the transitional test sees the expected label even if ordering causes the early run-action notice to be missed.
  - Non-legacy, namespaced configs unaffected.

- Init — preserve‑scripts prompt during legacy upgrade
  - Seeded interactive defaults for `stan init` from the migrated config and CLI loader instead of engine loader (which fails pre‑migration).
  - Ensures the “Preserve existing scripts?” confirm appears when upgrading legacy configs, and that existing `stan-cli.scripts` are retained when preserved.
  - Reused the resolved `stanPath` from the UI defaults for downstream steps.

- Tests — fix false‑positive root‑level scripts check in init migration test
  - Tightened regex to match only a root‑level `scripts:` line, avoiding nested matches under `stan-cli`.

- Run — include‑on‑change for ephemeral system prompt (quiet diffs on steady state)
  - For `--prompt core|<path>`, compare the effective prompt hash against the baseline recorded at snap.
  - When changed, inject before diff so the prompt appears exactly once in archive.diff.tar; otherwise create the diff first without injection and inject only for the full archive. Always restore original bytes afterward (no persistent overwrite).

- Snap — record effective prompt identity for baseline
  - Compute the effective prompt (cliDefaults.run.prompt | auto), hash its bytes, and update `.stan/system/.docs.meta.json` with `prompt: { source, hash, path? }` (best‑effort; preserves unknown keys).
  - New helpers: `src/stan/util/hash.ts`, `src/stan/system/docs-meta.ts`.

- DRY — unify CLI command headers
  - Added `src/cli/stan/header.ts` to centralize BORING/TTY-aware header printing.
  - Updated:
    - `src/cli/stan/run/action.ts`,
    - `src/cli/stan/snap.ts`,
    - `src/cli/stan/patch.ts` to use the shared helper (removed local isBoring/header duplication).

- DRY — centralized STAN workspace paths
  - Added `src/stan/paths.ts` (`stanDirs(cwd, stanPath)`) to compute common paths: system/output/diff/patch and the system prompt file.
  - Refactored:
    - `src/stan/run/archive.ts`
    - `src/stan/run/session/archive-stage.ts` to use it.

- Typedoc — include ScriptMap in docs
  - Re‑exported `ScriptMap` from the library entry so Typedoc includes the referenced type used by `RunnerConfig.scripts`, eliminating the prior warning.

- Tests — small unit coverage
  - Added header unit tests for BORING/TTY branches (`src/cli/stan/header.test.ts`).
  - Added a focused test for `stanDirs` path helper (`src/stan/paths.test.ts`).

- Docs — Getting Started
  - Noted PATH augmentation for child scripts so repo‑local binaries resolve without globals.

- Tests — stabilize header test and fix lint
  - Cleared NO_COLOR/FORCE_COLOR alongside STAN_BORING to exercise styled TTY branch.
  - Replaced unsafe String(...) usage with safe argument joining to satisfy @typescript-eslint/no-base-to-string.

- Typedoc — include ScriptEntry
  - Re‑exported `ScriptEntry` in `src/index.ts` to resolve the reference warning from `ScriptMap`.

- Tests — fix styled TTY header branch by making TTY detection dynamic
  - Updated `src/stan/util/color.ts` so `isBoring()` computes TTY on each call instead of capturing it at module import. This allows tests to toggle TTY and ensures runtime honors current TTY and env flags consistently.

  - DRY — remove redundant barrels and realign imports
  - Deleted `src/stan/index.ts` (barrel-of-barrel under top-level index), `src/stan/run/exec/index.ts` (unused exec barrel), and `src/stan/run/live/types.ts` (re-export-only types).
  - Updated imports to reference canonical sources directly:
    - Top-level `src/index.ts` now exports from `./stan/help` and `./stan/run` directly, and consolidates type re-exports (`ScriptMap`, `ScriptEntry`).
    - Live renderer/util/frame import `RowMeta`/`ScriptState` from `@/stan/run/types` instead of the removed `live/types` indirection.

- Docs — Migration note and typedoc wiring
  - Added docs-src/migration.md describing the namespaced layout and how to migrate via `stan init` (with .bak and `--dry-run`).
  - Registered the page in typedoc.json and linked it from README.

- Docs — CLI plan/prompt and init flags
  - Clarified that the run plan header includes a `prompt:` line in CLI docs.
  - Added init migration notes (.bak, `--dry-run`) to Getting Started.

- Run — plan-only prints resolved prompt
  - Updated `stan run -p` path to resolve the system prompt and include a `prompt:` line in the printed plan (core/local/path/auto). Falls back to the base plan if resolution fails. Commit Message

- Prompt resolver follow‑through — stabilize tests & TSDoc
  - Adjusted fallback test to return a minimal NodeJS.Require with resolve from the mocked createRequire, ensuring the fallback path is exercised.
  - Removed the lone any cast in the test (no-explicit-any).
  - Escaped @ reference in resolve.ts TSDoc to satisfy tsdoc/syntax.
