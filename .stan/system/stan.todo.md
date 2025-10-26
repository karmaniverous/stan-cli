# STAN Development Plan

## Next up (priority order)

- Testing infrastructure — Vitest Option 1 (apply consistently)
  - Make node the default environment in vitest.config.ts; use DOM only per‑suite when necessary.
  - Introduce an ESM‑friendly mock helper that returns `{ __esModule: true, default: impl, ...impl }`; convert mocks for node:child_process, node:module, clipboardy, tar, and any partial core/CLI mocks to this pattern.
  - In suites where mocked deps are needed at module‑eval time, switch to `vi.doMock` + dynamic SUT import after `vi.resetModules()`.
  - In CI, set `test.pool = 'forks'` to reduce hoist/order issues. Keep `server.deps.inline: ['@karmaniverous/stan-core', 'tar']`.
  - Re‑run the suite locally and in release to confirm stability (no “not a function”/SyntaxError flukes).

- Facet overlay — enabled‑wins tie‑breaker and scoped re‑inclusion
  - Subtree roots: drop inactive roots from excludesOverlay when they equal / contain / are contained by any active root (enabled facet wins).
  - Leaf‑glob excludes (e.g., `**/*.test.ts`): add scoped anchors `<activeRoot>/**/<globTail>` for each active root to re‑include matching files only inside active areas.
  - Preserve reserved denials; do not attempt to re‑include them.
  - Update plan rendering and `.docs.meta.json.overlay` (optional `overlapKept`) to aid troubleshooting.

- Facet overlay — tests
  - Add unit tests for:
    - Equal‑root overlap (inactive root dropped).
    - Parent/child overlap (inactive parent dropped when child is active).
    - Leaf‑glob re‑inclusion (tests under active areas only).
  - Keep existing ramp‑up safety tests working.

- Requirements & docs
  - Update CLI docs/help for facet strategy (tie‑breaker + scoped anchors) and Vitest Option 1 guidance.
  - Ensure path‑augmentation behavior is explicitly documented in CLI help.

---

## Completed (recent)

- Facet overlay — scaffolding and CLI plumbing
  - Added overlay reader/composer, overlay flags, and overlay metadata.
  - Implemented anchor union and inactive‑root excludes; ramp‑up safety prevents drops when anchors are missing.

- Reserved denials — anchors do not override
  - Verified that anchors never re‑include `.stan/diff/**`, `.stan/patch/**`, or archive outputs and added integration tests to lock this in.

- Testing — Vitest Option 1 adoption (node env + ESM-friendly mocks)
  - Set default test environment to node and prefer pool='forks' in CI.
  - Added ESM-friendly mock helper (src/test/mock-esm.ts).
  - Updated src/cli/index.help.test.ts to use the helper so named imports stay stable under SSR.
  - Use forks pool unconditionally so process.chdir() in CLI suites works under Vitest; worker-threads pool forbids chdir in workers.

  - Updated src/cli/patch.jsdiff.test.ts to use vi.resetModules + vi.doMock + dynamic SUT import with ESM-shaped mocks, stabilizing named export resolution and preventing registerPatch import shape issues under Node/SSR.
  - Hardened CLI SSR interop:
    - src/cli/patch.ts now resolves applyCliSafety from named or default exports to avoid “not a function” under SSR/evaluation order.
    - src/cli/config/load.ts adds a minimal, safe fallback when the schema binding is unavailable in rare worker contexts, preserving expected defaults for tests while keeping strict validation as primary path.
  - Fixed a lingering direct call to applyCliSafety on the subcommand in src/cli/patch.ts; now uses the robust resolver resolveApplyCliSafety()?.(sub) to prevent TypeScript and runtime errors in SSR/tests.