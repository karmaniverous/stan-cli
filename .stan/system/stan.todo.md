# STAN Development Plan

When updated: 2025-10-02 (UTC)

This plan tracks the stan-cli (CLI/runner) workstream. The stan-core (engine)
track is managed in the stan-core repository.

---

## Track — stan-cli (CLI and runner)

### Next up (priority order)

- Rewire imports to top-level @karmaniverous/stan-core
  - Replace broken imports of '@/stan/config', '../{archive,diff,imports,...}' and similar engine paths with
    top-level `@karmaniverous/stan-core` imports (no subpaths).
  - Inline minimal local path helpers where engine internals were previously used (e.g., output/diff paths).
  - Open interop with stan-core to confirm top-level exports (prompt helpers, CORE_VERSION).

- Swappable core loader (`--core`)
  - Implement a single `--core <value>` flag (env: `STAN_CORE`) that loads the
    entire core:
    - Omitted → installed `@karmaniverous/stan-core`.
    - `dist:/path` → import `<path>/dist/mjs/index.js` (fallback cjs).
    - `src:/path` → register `tsx` from `<path>` and import
      `<path>/src/stan/index.ts`.
    - Auto path → prefer dist if present; else src via tsx; else error with
      actionable guidance.
  - Version/shape handshake:
    - Require `CORE_VERSION` and expected exports (duck‑typed).
    - Print banner:
      `Using core: <package|path> (CORE_VERSION <x.y.z>) [dist|src]`.

- Prompt injection from selected core
  - Resolve monolith via `getPackagedSystemPromptPath()`.
  - In dev (src mode), optionally run
    `assembleSystemMonolith(cwd, stanPath)` before injection.
  - Ensure injected prompt rides in full (not diff) archives deterministically
    and is restored immediately after archiving.

- Patch adapter (acquisition/presentation)
  - Acquire patch from argument/file/clipboard; pass the string to core
    (`detectAndCleanPatch` → `applyPatchPipeline`).
  - Persist cleaned patch to `<stanPath>/patch/.patch` for the `git apply`
    path.
  - Print unified diagnostics envelopes on failure (downstream/stan contexts).
  - Open modified files via configured editor (best‑effort).

- Archive/diff adapter
  - Stage imports before archiving.
  - Present core warnings exactly once per phase; styling controlled by CLI.
  - Diff archive must not force‑include the monolith.

- Interop threads (multi‑file; no front matter; aggressive pruning)
  - Adopt outgoing directory `.stan/interop/core-interop/*.md`.
  - Stage incoming peer messages via imports under
    `.stan/imports/stan-core/*.md`.
  - When a change implies peer action, create a new outgoing interop file:
    - Filename: `<UTC>-<slug>.md` (e.g., `20251001-170730Z-swappable-core.md`).
    - Body: concise Markdown (subject optional + bullets for what/why/actions).
  - Aggressive pruning: once conclusions are ingested into local
    requirements/dev plan, remove resolved messages via File Ops.

- Runner cancellation hardening
  - Ensure sequential scheduling gate prevents “after” scripts from starting
    beyond a SIGINT boundary; preserve late‑cancel guard before archive in live
    and non‑live modes. Keep parity of artifacts between live/logger.

- Testing (CLI)
  - Loader tests for `--core` paths (dist/src/auto) and banner output.
  - Prompt injection tests (packaged and on‑demand assemble in dev).
  - Interop message creation and pruning via File Ops.
  - Archive/diff presentation tests (warnings printed once; BORING/non‑TTY
    parity).
  - Logger WARN test parity (warnPattern → status `warn` path).

- Documentation (CLI)
  - Update help/usage for `--core`, interop threads policy, and engine purity
    expectations.

### Backlog / follow‑through

- Live table final‑frame flush audit for edge cases.
- Editor‑open gating policy doc (“test mode” and force‑open options).
- UX polish for diagnostics envelope presentation.

---

## Completed (recent)

- Removed stan-core engine duplicates from stan-cli to open context and prepare
  for wiring to the linked core:
  - deleted `src/stan/{archive, classifier, config, diff, fs, imports, module,
    paths, system, validate, patch}` and associated tests,
  - deleted `tools/gen-system.ts` (prompt assembly now owned by core),
  - preserved `.stan/imports` for core context.
- Follow‑up: rewire CLI adapters (run/patch/snap/help/preflight) to import
  engine APIs from stan-core and restore build/tests.

- Unified diagnostics envelope and follow‑up options clarified.
- Response‑format validator improvements and WARN parity across UIs.
- Windows EBUSY mitigation in tests and cancellation paths.
- Imports staging and selection parity improvements.

---
