# STAN Development Plan

When updated: 2025-10-01 (UTC)

This plan tracks two synchronized tracks to complete the separation between engine and CLI and to enable a swappable engine at runtime:

- Track A — stan-core (engine): pure services, no CLI/TTY/process concerns.
- Track B — stan-cli (CLI/runner): adapters, UX, input acquisition, presentation, and composition.

A cross-repo “Interop Threads” mechanism (multi-file Markdown messages) is included to coordinate changes across repos. Once the repos are connected and stable, we will prune this plan’s dual-track content and migrate each track to its respective repository.

---

## Guiding principles (both tracks)

- Engine purity: core doesn’t acquire inputs (no clipboard), doesn’t present outputs (no console/TTY/color), and exposes diagnostics through return values and/or optional callbacks.
- Swappable core: the entire engine can be loaded by the CLI via a single `--core` option, which determines how to import the engine (dist or TS source via tsx) and verifies version/shape before use.
- Deterministic archives: imports are staged under `<stanPath>/imports/<label>/…` and included in both full and diff archives.
- Interop threads (multi‑file, no front matter): outgoing messages live under `.stan/interop/<label>/*.md`, incoming (peer) messages are staged under `.stan/imports/<label>/*.md`. Aggressively prune once conclusions are ingested into requirements and dev plan.

---

## Track A — stan-core (engine)

### Next up (priority order)

- Core purity (no acquisition/presentation edges)
  - [ ] Remove direct clipboard usage from the engine:
        - Do not import `clipboardy` anywhere in core.
        - Engine accepts patch input as strings only (`detectAndCleanPatch` → `applyPatchPipeline`).
        - Move any patch source resolution (argument/file/clipboard) helper to CLI; keep only cleaners and pipeline in core.
  - [ ] Remove console logging from core:
        - `createArchive` / `createArchiveDiff`: expose `warnings?: string` in the result and support optional `onArchiveWarnings?: (text: string) => void`; default silent.
        - `prepareImports`: return per-label summaries (e.g., `{label, files[]}`) and support optional `onStage?: (label: string, files: string[]) => void`; default silent.
        - Update tests to assert returned warnings/summaries or injected callbacks (no console spies).
  - [ ] Remove TTY/presentation helpers from core:
        - Delete `src/stan/util/{color.ts,status.ts,time.ts}` and ensure they are not exported.

### Completed (recent)

### Completed (recent)

- Posted interop guidance to stan-cli listing engine‑duplicate modules safe to
  delete and the replacement imports from @karmaniverous/stan-core.

- Removed readPatchSource from core; moved patch source acquisition to the CLI.
  Deleted `src/stan/patch/run/source.ts` and `src/stan/patch/run/source.test.ts`.
  Core remains string‑first (CLI acquires raw text, calls `detectAndCleanPatch`,
  writes to `<stanPath>/patch/.patch`, and invokes `applyPatchPipeline`).
 
- Engine boundary hardening (clipboard):
  - Removed clipboard usage from core patch source resolver; no `clipboardy` import in engine.
  - Added injected `clipboardRead` option for callers; tests updated to pass a stub.

- Public API stability for swappable core
  - [ ] Export `CORE_VERSION` constant and verify that the public surface matches the spec below (duck-typed by CLI at load time).
  - [ ] Keep prompt helpers exported and quiet:
        - `getPackagedSystemPromptPath(): string | null`
        - `assembleSystemMonolith(cwd: string, stanPath: string) → Promise<{ target: string; action: 'written' | 'skipped-no-parts' | 'skipped-no-md' }>`
  - [ ] Ensure all APIs return data and optionally accept callbacks; no direct logging.

- Archiving/diff/snapshot
  - [ ] Confirm binary screening and large-text flagging remain deterministic; surface warnings via return/callbacks only.
  - [ ] Ensure snapshot write parity and sentinel behavior are unchanged.

- Patch engine
  - [ ] Keep the canonical string-based ingestion: `detectAndCleanPatch(raw) → cleaned` → `applyPatchPipeline({ cleaned, patchAbs, check })`.
  - [ ] Maintain jsdiff fallback behavior (EOL/whitespace tolerance) and structured failure outputs; no console I/O.
  - [ ] Creation-patch fallback (see requirements): run only after pipeline failure and only for confident new-file cases.

- Imports staging (engine-side)
  - [ ] `prepareImports` returns summaries and supports `onStage` callback (engine silent by default).

- Testing (engine)
  - [ ] Update tests that currently spy on console; assert returned data and/or callback invocations.
  - [ ] Add tests for the callback paths (`onArchiveWarnings`, `onStage`) and for absence of side effects when callbacks are omitted.

- Packaging & distribution
  - [ ] Ensure Rollup outputs (mjs/cjs/types) include `dist/stan.system.md` and exclude CLI-only concerns.
  - [ ] Confirm tar and fs-extra remain externals (tree-shaking preserved).

### Completed (recent)

- Core/CLI decomposition (phase 1):
  - Removed CLI adapters and runner from stan-core; pruned CLI-only services/tests.
  - Rollup builds library and types only; CLI bundle removed.
  - Package.json trimmed; CLI bin and CLI-only runtime deps removed.
  - Core archive warnings de-colored; decoupled from CLI styling.
  - Public exports narrowed to engine APIs; patch barrel surfaced engine primitives.
  - Typedoc project documents trimmed (engine only; CHANGELOG).

- Split hygiene:
  - Removed CLI/runner tests that imported removed `./run` modules.
  - Fixed patch API barrel (exported `applyPatchPipeline`, `detectAndCleanPatch`, `executeFileOps`, `parseFileOpsBlock`).
  - README updated for engine usage and top-level barrel exports.

- Tooling housekeeping:
  - knip hints addressed; unused ignoreDependencies entries pruned.

### Backlog / follow‑through

- Performance profiling for large repos (selection and tar streaming).
- Optional logger injection pattern (future) to support structured logging across hosts.
- Creation-patch fallback heuristics: broaden coverage for nested new files and Markdown.

---

## Track B — stan-cli (CLI and runner)

### Next up (priority order)

- Swappable core loader (`--core`)
  - [ ] Implement a single `--core <value>` flag (env: `STAN_CORE`) that loads the entire core:
        - Omitted → installed `@karmaniverous/stan-core`.
        - `dist:/path` → import `<path>/dist/mjs/index.js` (fallback cjs).
        - `src:/path` → register `tsx` from `<path>` and import `<path>/src/stan/index.ts`.
        - Auto path → prefer dist if present; else src via tsx; else error with actionable guidance.
  - [ ] Version/shape handshake:
        - Require `CORE_VERSION` and expected exports (duck-typed).
        - Print banner: `Using core: <package|path> (CORE_VERSION <x.y.z>) [dist|src]`.

- Prompt injection from selected core
  - [ ] Resolve monolith via `getPackagedSystemPromptPath()`.
  - [ ] In dev (src mode), optionally run `assembleSystemMonolith(cwd, stanPath)` before injection.
  - [ ] Ensure injected prompt rides in full and diff archives deterministically.

- Patch adapter (acquisition/presentation)
  - [ ] Acquire patch from argument/file/clipboard; pass the string to core (`detectAndCleanPatch` → `applyPatchPipeline`).
  - [ ] Persist cleaned patch to `<stanPath>/patch/.patch` for git apply path.
  - [ ] Print unified diagnostics envelopes on failure (downstream/stan contexts).
  - [ ] Open modified files via configured editor (best‑effort).

- Archive/diff adapter
  - [ ] Present archive warnings returned by core exactly once per phase; CLI controls styling and TTY behavior (engine silent by default).

- Interop threads (multi-file, no front matter)
  - [ ] Adopt outgoing directory `.stan/interop/<label>/*.md` (e.g., `core-interop`).
  - [ ] Stage incoming peer messages via imports under `.stan/imports/<label>/*.md`.
  - [ ] When a change implies peer action, create a new outgoing interop file:
        - Filename: `<UTC>-<slug>.md` (e.g., `20251001-170730Z-clipboard-boundary.md`).
        - Body: concise Markdown (subject optional + bullets with what/why/actions/links).
  - [ ] Aggressive pruning: once conclusions are ingested into local requirements/dev plan, propose File Ops to remove resolved messages.

- Testing (CLI)
  - [ ] Loader tests for `--core` paths (dist/src/auto) and banner output.
  - [ ] Prompt injection tests (packaged and on-demand assemble in dev).
  - [ ] Interop message creation and pruning via File Ops.
  - [ ] Archive/diff presentation tests (warnings printed once; parity in BORING/non-TTY).

- Documentation (CLI)
  - [ ] Update help/usage for `--core`, interop threads policy, and engine purity expectations.

### Completed (recent)

- N/A (CLI work begins now; prior work focused on core decomposition and surfacing engine APIs).

### Backlog / follow‑through

- Live table final-frame flush audit for edge cases.
- Editor-open gating policy doc (test mode and force-open options).
- UX polish for diagnostics envelope presentation.

---

## Cross‑repo Interop & Imports (both repos)

### Interop threads (multi‑file, no front matter; aggressive pruning)

- Purpose
  - Coordinate cross‑repo actions (CLI ↔ Core) with small, self-contained message files that order deterministically and produce minimal diffs.

- Locations
  - Outgoing (authored locally): `.stan/interop/<label>/*.md`
    - `<label>` is the agreed import label the peer uses to stage your messages (operational slug).
    - Examples:
      - In stan-cli: `.stan/interop/core-interop/*.md`
      - In stan-core: `.stan/interop/cli-interop/*.md`
  - Incoming (staged via imports): `.stan/imports/<label>/*.md`
    - Examples:
      - In stan-cli: `core-interop` imports peer messages from `../stan-core/.stan/interop/stan-cli/*.md`
      - In stan-core: `cli-interop` imports peer messages from `../stan-cli/.stan/interop/stan-core/*.md`

- Filename convention
  - `<UTC>-<slug>.md`
    - `<UTC>`: `YYYYMMDD-HHMMSSZ` (UTC; lexicographic chronological order)
    - `<slug>`: short, url‑safe, lower‑case (e.g., `api-surface`, `clipboard-boundary`, `swappable-core`)

- Body format
  - Plain Markdown; optional first-line subject (`# …`) and bullets for: what/why/actions/links.

- Assistant obligations
  - Always scan incoming interop messages (sorted by filename) before proposing cross‑repo work.
  - When a change implies peer action, propose creation of an outgoing interop file using the naming convention and concise body.
  - Append‑only: never rewrite prior messages; new info = new file.
  - Aggressive pruning: once conclusions are reflected in local requirements/dev plan, propose File Ops to remove resolved interop messages. No rotation — keep threads short and ephemeral.

### Imports (dev-friendly defaults)

- stan-cli `stan.config.yml`:
  - `core-docs`: `../stan-core/.stan/system/stan.requirements.md`, `../stan-core/.stan/system/stan.todo.md`
  - `core-types`: `../stan-core/dist/index.d.ts`
  - `core-interop`: `../stan-core/.stan/interop/stan-cli/*.md`

- stan-core `stan.config.yml`:
  - `cli-docs`: `../stan-cli/.stan/system/stan.requirements.md`, `../stan-cli/.stan/system/stan.todo.md`
  - `cli-interop`: `../stan-cli/.stan/interop/stan-core/*.md`

---

## Risks & mitigations

- API drift between CLI and swappable core:
  - Mitigation: `CORE_VERSION` + duck-typed shape checks; fail-fast banner with guidance.
- Test churn from removing console logs in core:
  - Mitigation: transitional optional callbacks + returned data; update assertions accordingly.
- Interop noise:
  - Mitigation: aggressive pruning policy; assistants must propose File Ops to remove stale messages on resolution.

---

## Completed (recent) — consolidated

- Decomposition (phase 1, core)
  - Removed CLI adapters/runner; pruned CLI-only services/tests.
  - Library/types-only Rollup build; CLI bundle removed; externals enforced.
  - Archive warnings de-colored; decoupled from styling.
  - Patch barrel exports surfaced engine primitives.
  - Typedoc project documents trimmed; engine‑only README.
  - knip hints addressed; unused config entries pruned.

- Split hygiene (core)
  - Removed `./run*` tests and repaired imports/exports.
  - Package metadata converged on engine‑only usage.

---

## Near-term acceptance criteria (exit for this phase)

- Core
  - No direct clipboard/editor/TTY dependencies; no console I/O.
  - `createArchive`/`createArchiveDiff`/`prepareImports` expose warnings/summaries via return and/or callback; tests updated accordingly.
  - `CORE_VERSION` exported; prompt helpers available and quiet.

- CLI
  - `--core` loader functional (dist/src/auto), with banner and version guard.
  - Prompt injection from selected core works (packaged or assembled in dev).
  - Patch adapter acquires string sources and delegates to core; diagnostics envelope presentation stable.
  - Interop threads flow exercised; aggressive pruning demonstrated (File Ops).

When all acceptance criteria are met and integration is stable, migrate each track to its respective repository and prune cross‑content here.
