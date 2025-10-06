# STAN Development Plan

When updated: 2025-10-06 (UTC)

This plan tracks the stan-cli (CLI/runner) workstream. The stan-core (engine) track is managed in the stan-core repository.

---

## Track — stan-cli (CLI and runner)

### Next up (priority order)

<!-- trimmed; items addressed below in Completed (recent) -->

- Rewire imports to top-level @karmaniverous/stan-core
  - Replace broken imports of '@/stan/config', '../{archive,diff,imports,...}' and similar engine paths with top-level `@karmaniverous/stan-core` imports (no subpaths).
  - Inline minimal local path helpers where engine internals were previously used (e.g., output/diff paths).
  - Open interop with stan-core to confirm top-level exports (prompt helpers, CORE_VERSION).

- Swappable core loader (`--core`)
  - Implement a single `--core <value>` flag (env: `STAN_CORE`) that loads the entire core:
    - Omitted → installed `@karmaniverous/stan-core`.
    - `dist:/path` → import `<path>/dist/mjs/index.js` (fallback cjs).
    - `src:/path` → register `tsx` from `<path>` and import `<path>/src/stan/index.ts`.
    - Auto path → prefer dist if present; else src via tsx; else error with actionable guidance.
  - Version/shape handshake:
    - Require `CORE_VERSION` and expected exports (duck‑typed).
    - Print banner: `Using core: <package|path> (CORE_VERSION <x.y.z>) [dist|src]`.

- Prompt injection from selected core
  - Resolve monolith via `getPackagedSystemPromptPath()`.
  - In dev (src mode), optionally run `assembleSystemMonolith(cwd, stanPath)` before injection.
  - Ensure injected prompt rides in full (not diff) archives deterministically and is restored immediately after archiving.

- Patch adapter (acquisition/presentation)
  - Acquire patch from argument/file/clipboard; pass the string to core (`detectAndCleanPatch` → `applyPatchPipeline`).
  - Persist cleaned patch to `<stanPath>/patch/.patch` for the `git apply` path.
  - Print unified diagnostics envelopes on failure (downstream/stan contexts).
  - Open modified files via configured editor (best‑effort).

- Archive/diff adapter
  - Stage imports before archiving.
  - Present core warnings exactly once per phase; styling controlled by CLI.
  - Diff archives must not force‑include the monolith.

- Interop threads (multi‑file; no front matter; aggressive pruning)
  - Adopt outgoing directory `.stan/interop/core-interop/*.md`.
  - Stage incoming peer messages via imports under `.stan/imports/stan-core/*.md`.
  - When a change implies peer action, create a new outgoing interop message file:
    - Filename: `<UTC>-<slug>.md` (e.g., `20251001-170730Z-swappable-core.md`).
    - Body: concise Markdown (subject optional + bullets for what/why/actions).
  - Aggressive pruning: once conclusions are ingested into local requirements/dev plan, remove resolved messages via File Ops.

- Runner cancellation hardening
  - Ensure sequential scheduling gate prevents “after” scripts from starting beyond a SIGINT boundary; preserve late‑cancel guard before archive in live and non‑live modes. Keep parity of artifacts between live/logger.

- Testing (CLI)
  - Loader tests for `--core` paths (dist/src/auto) and banner output.
  - Prompt injection tests (packaged and on‑demand assemble in dev).
  - Interop message creation and pruning via File Ops.
  - Archive/diff presentation tests (warnings printed once; BORING/non‑TTY parity).
  - Logger WARN test parity (warnPattern → status `warn` path).

- Documentation (CLI)
  - Update help/usage for `--core`, interop threads policy, and engine purity expectations.

### Backlog / follow‑through

- Live table final‑frame flush audit for edge cases.
- Editor‑open gating policy doc (“test mode” and force‑open options).
- UX polish for diagnostics envelope presentation.

---

## Completed (recent)

- Test capture & WARN parity
  - Migrated Vitest inlining to server.deps.inline so vi.mock('tar') applies across @karmaniverous/stan-core and tar. Removed a per-test tar re‑mock to rely on the global capture store.
  - Implemented robust WARN detection: compile warnPattern variants (as‑is, de‑escaped, case‑insensitive) and treat any‑of across in‑memory and persisted output as a WARN when exit=0. Logger UI now prints [WARN] as expected.
  - Improved Windows teardown resilience in cancel parity test by using rmDirWithRetries to mitigate intermittent EBUSY.

- Docs warning
  - Suppressed external-type warning in Typedoc by setting `"excludeExternals": true`, keeping CLI docs clean without importing staged core types.

- Cleanup
  - Removed unused `src/stan/util/status.ts`.
  - Pruned unused dependencies flagged by knip from package.json (`diff`, `fast‑glob`, `glob‑parent`, `ignore`, `picomatch`). Kept `tar` as a devDependency to support test-time mocking.

- Lint & test hardening (combine + WARN logger)
  - Removed unused catch param in `src/stan/patch/service.ts` to satisfy ESLint.
  - Used precomputed `dirs.outputAbs` in `src/stan/run/archive.ts` (removes unused var and avoids recompute).
  - Runner WARN parity: tolerate over‑escaped regex patterns (e.g., "\\\\bWARN\\\\b") by de‑escaping backslashes as a fallback when compiling `warnPattern`.
  - Test tar mocks updated to support both `tar.create` and `tar.c`, matching current core usage so capture/filters are asserted reliably: `src/stan/run.combine.archive.behavior.test.ts`, `src/stan/snap/selection-sync.test.ts`.

- Build/typecheck/test unblock (phase 1)
  - Removed stale prebuild step: `package.json` build no longer calls deleted `tools/gen-system.ts`.
  - Implemented CLI patch service (`src/stan/patch/service.ts`) that acquires, cleans, persists, and applies patches via stan-core pipeline; prints concise source and terminal status.
  - Rewired CLI and tests to top-level `@karmaniverous/stan-core` types: updated imports in `src/cli/stan/run-args.ts`, `src/cli/stan/run/derive.ts`, and tests under `src/stan/run/*` and `src/stan/preflight.run.test.ts`.
  - Fixed `src/stan/version.ts` to remove deleted internals; resolved module root via `package-directory`, computed local dirs in-file, and preserved existing preflight/version behavior.
  - Fixed a small stray reference in `src/stan/run/archive.ts` (use local `makeDirs`).

- Removed stan-core engine duplicates from stan-cli to open context and prepare for wiring to the linked core:
  - deleted `src/stan/{archive, classifier, config, diff, fs, imports, module, paths, system, validate, patch}` and associated tests,
  - deleted `tools/gen-system.ts` (prompt assembly now owned by core),
  - preserved `.stan/imports` for core context.
- Follow‑up: rewire CLI adapters (run/patch/snap/help/preflight) to import engine APIs from stan-core and restore build/tests.

- Unified diagnostics envelope and follow‑up options clarified.
- Response‑format validator improvements and WARN parity across UIs.
- Windows EBUSY mitigation in tests and cancellation paths.
- Imports staging and selection parity improvements.
