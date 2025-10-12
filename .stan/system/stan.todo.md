# STAN Development Plan

When updated: 2025-10-12 (UTC)

This plan tracks near‑term and follow‑through work for the stan‑cli package (CLI and runner). The stan‑core split is complete; engine work is tracked in the stan‑core repository.

---

## Next up (priority order)

1. Config migration (legacy → namespaced) in init
   - Detect legacy root keys; migrate known engine keys to stan-core and known CLI keys to stan-cli.
   - Preserve unknown root keys; keep format/filename; write a .bak; support --dry-run; idempotent.
   - Interactive prompt (default Yes); --force migrates without prompt.

2. Transitional engine-config extraction (honor legacy excludes/includes)
   - In run/snap: if stan-core loader fails due to missing “stan-core”, synthesize ContextConfig from legacy root keys (stanPath/includes/excludes/imports) and pass to engine APIs.
   - Emit a debugFallback notice (STAN_DEBUG=1) indicating legacy extraction was used.
   - Add focused tests: legacy config present → excludes/includes applied (via synthesized config).

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
