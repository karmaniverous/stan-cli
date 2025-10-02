# STAN Development Plan

When updated: 2025-10-02 (UTC)

This plan tracks near‑term and follow‑through work for the stan‑core engine only. CLI/runner tasks are managed in the stan‑cli repository.

---

## Next up (priority order)

- Console‑free surfaces (callbacks/returns)
  - Replace direct logging of archive classifier output with a returned `warnings` string and/or optional callback hook:
    - `onArchiveWarnings(text)` for `createArchive` and `createArchiveDiff`.
  - Update tests to assert returned data and/or callback invocations (no console spies).

- Imports staging summaries
  - Extend `prepareImports` to support an optional `onStage(label, files[])` callback and/or return per‑label summaries.
  - Update tests accordingly; preserve default silent behavior.

- Engine surface hygiene
  - Remove presentation helpers from core and ensure they are not exported:
    - Delete `src/stan/util/{color.ts,status.ts,time.ts}`; repair barrels; update knip hints.
  - Export `CORE_VERSION` and add a unit test that asserts presence (stan‑cli will duck‑type version/shape during `--core` load).

- Patch engine fidelity
  - Maintain the canonical ingestion path: `detectAndCleanPatch(raw) → cleaned` → `applyPatchPipeline({ cleaned, patchAbs, check })`.
  - Implement creation‑patch fallback for confident new‑file diffs (post‑pipeline), including nested path creation; add unit tests (write/sandbox).

- Packaging & distribution
  - Ensure Rollup outputs ESM/CJS + `.d.ts` only (no CLI bundle).
  - Ship `dist/stan.system.md` alongside library artifacts.
  - Keep `tar` and `fs-extra` as runtime externals; preserve tree‑shaking.

---

## Completed (recent)

- Posted interop guidance to stan‑cli identifying engine‑duplicate modules safe to delete and the corresponding `@karmaniverous/stan-core` imports to adopt.

- Removed `readPatchSource` from core and delegated patch source acquisition to stan‑cli.
  - Core remains string‑first: stan‑cli acquires raw text, calls `detectAndCleanPatch`, writes to `<stanPath>/patch/.patch`, then invokes `applyPatchPipeline`.

- Core/CLI decomposition (phase 1)
  - Removed CLI adapters/runner from the engine code base; pruned CLI‑only services/tests.
  - Rollup builds library and types only; CLI bundle removed.
  - Package metadata converged on engine‑only usage.
  - Archive warnings de‑colored; decoupled from CLI styling.
  - Patch barrel exports surfaced engine primitives.
  - Typedoc documents reflect engine‑only surfaces; CHANGELOG retained.
  - knip hints addressed; unused config entries pruned.

---

## Backlog / follow‑through

- Performance profiling for large repos (selection traversal and tar streaming).
- Optional logger injection pattern (future) to support host‑provided structured logging without introducing a logging dependency into core.

---

## Interop & imports hygiene (engine side)

- Outgoing interop (local authoring): `.stan/interop/stan-cli/<UTC>-<slug>.md`
  - Use for short, actionable coordination with stan‑cli on boundary or loader topics.
  - Aggressively prune resolved interop files via File Ops once conclusions are reflected here.

- Incoming interop (context only): `.stan/imports/stan-cli/*.md`
  - Scan staged peer notes before proposing cross‑repo actions.
  - Never modify or remove files under `.stan/imports/**`.

---

## Acceptance criteria (near‑term)

- No direct clipboard/editor/TTY dependencies; no console I/O in core.
- `createArchive` / `createArchiveDiff` and `prepareImports` surface notes via return values and/or callbacks; tests updated to assert data/callbacks.
- `CORE_VERSION` exported; prompt helpers (`getPackagedSystemPromptPath`, `assembleSystemMonolith`) available and quiet.
- Patch engine:
  - git apply attempt captures are structured and summarized,
  - jsdiff fallback tolerant to LF/CRLF and whitespace,
  - creation‑patch fallback works for confident new‑file cases and nested paths.
