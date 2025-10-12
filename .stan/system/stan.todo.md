# STAN Development Plan

When updated: 2025-10-12 (UTC)

This plan tracks near‑term and follow‑through work for the stan‑cli package (CLI and runner). The stan‑core split is complete; engine work is tracked in the stan‑core repository.

---

## Next up (priority order)

3. Deprecation staging for config ingestion
   - Phase 1: keep legacy extractor + loader fallback; emit debugFallback notices when used; changelog guidance to run “stan init”.
   - Phase 2: require STAN_ACCEPT_LEGACY=1 for legacy; otherwise fail early with a concise message (“Run ‘stan init’ to migrate config.”).
   - Phase 3: strict stan-cli only (remove legacy acceptance).

4. Docs & help updates
   - Configuration: namespaced layout only; “Migration” appendix → “run stan init”.
   - Getting Started/CLI Usage: namespaced examples; note prompt flag and PATH augmentation (already covered).
   - Init help: mention migration and .bak/--dry-run.

5. Silent fallback audit (narrowed to config/migration scope)
   - Ensure debugFallback is used on: legacy engine extraction; legacy CLI loader fallback; DEFAULT_STAN_PATH resolution.
   - Tests assert no debug output unless STAN_DEBUG=1 (behavior unchanged otherwise).

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
  - Added a `preAction` hook on the run subcommand to emit `run.action:engine-legacy` under `STAN_DEBUG=1` whenever the config lacks a top‑level `stan-core` node.
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

### Completed (recent)

- Init/service decomposition (finish) and namespaced migration helper
  - Added src/stan/init/service/migrate.ts and rewired performInitService to use it.
  - Removed legacy src/stan/init/service.ts to eliminate duplication and TS7053.
  - Fixed unsafe error handling in service/index.ts catch blocks (lint clean).
  - Updated init behavior tests to the namespaced model (stan-core/stan-cli); removed assumptions about legacy top‑level cliDefaults/scripts and root key order.
  - Kept unknown root keys intact and avoided re‑adding legacy keys when namespaces exist; migration remains idempotent and writes a .bak in force/confirmed paths.

  - Post‑fix: init/service now avoids writing legacy root keys when stan-core/stan-cli nodes exist.
    - Interactive and --force branches write engine keys to stan-core and CLI keys to stan-cli.
    - Root duplication of scripts/stanPath/includes/excludes/patchOpenCommand eliminated.
    - Snapshot selection derives includes/excludes from stan-core when present; stanPath resolution prefers stan-core.
    - Tests refined to assert absence of root keys using root-anchored regexes only (no false positives for nested keys).

- Init/service decomposition (helpers; no new subdir)
  - Extracted shared helpers to src/stan/init/service/helpers.ts (isObj/hasOwn/ensureNsNode/ensureKey/setKey).
  - Extracted resolveEffectiveStanPath to stanpath.ts and includes/excludes resolver to selection.ts.
  - Cleaned index.ts to import helpers and removed unused type imports.
  - No new folder was created; files live alongside index.ts per directive.

- Init — dry-run + .bak + idempotency
  - Added `--dry-run` to `stan init` (no writes; plan-only output); guarded service writes (config/.gitignore/docs meta/snapshot).
  - Added assertion that a `.bak` is written on migration (YAML path) and a test for idempotency (already namespaced config is a no-op).

- Transitional legacy engine-config extraction (test)
  - Added a test that a legacy-only config (root engine keys; no `stan-core`) triggers the debugFallback extraction path in `stan run -p` under `STAN_DEBUG=1`.
  - Keeps the loop green during release sequencing while exercising the synthesis code-path.

- Runner — stabilize sequential cancel gate
  - Ensured output files are created up front by moving the output stream open before spawn in `run-one.ts`. This guarantees `<key>.txt` exists even when cancellation occurs immediately after spawn, fixing the failing gate test.

- Docs — namespaced configuration
  - Updated the Configuration guide to show the namespaced layout exclusively and adjusted section headings (`stan-core` / `stan-cli`).

- Interop — request to core
  - Posted `.stan/interop/stan-core/20251012-000000Z-cli-namespacing-adopted.md` asking core to prune resolved interop notes so we can remove imports of core interop threads from this repo and keep archives lean.

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
