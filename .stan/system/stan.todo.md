# STAN Development Plan

## Next up (priority order)

- Facet overlay — tests
  - Add unit tests for:
    - Equal‑root overlap (inactive root dropped).
    - Parent/child overlap (inactive parent dropped when child is active).
    - Leaf‑glob re‑inclusion (tests under active areas only).
  - Keep existing ramp‑up safety tests working.

- Docs website follow‑through
  - Document facet overlay tie‑breaker (“enabled facet wins”) and scoped leaf‑glob re‑inclusion.
  - Document Vitest “Option 1” model (environment=node; pool=forks; ESM‑friendly mocks).
  - Document PATH augmentation for child processes (`<repo>/node_modules/.bin` precedence).

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

- Testing/SSR stability — robust import-shape guards
  - CLI run wiring: added named-or-default resolver for `registerRunAction` in `src/cli/runner/index.ts` to prevent “not a function” under Vitest SSR/forks.
  - Runner UI construction: resolved `LiveUI`/`LoggerUI` from named-or-default in `src/runner/run/service.ts` to avoid “LoggerUI is not a constructor” under SSR edge evaluation.
  - Archive stage call path: resolved `runArchiveStage` from named-or-default in `src/runner/run/session/index.ts` to prevent “runArchiveStage is not a function” during tests.
  - Scope: test-only robustness; no behavior change at runtime. Mirrors earlier fix for `applyCliSafety` in patch wiring.
  - Follow-up: re-run the suite to confirm the transient SyntaxError in `run.combine.test.ts` is eliminated along with the import-shape issues.

- Docs/help — unchanged in this patch (pure stability guards). Keep overlay docs and Option 1 test guidance aligned in future doc pass.

- Facet overlay — enabled-wins + scoped anchors
  - Implemented subtree tie-breaker (“enabled facet wins”): inactive exclude roots that equal/contain/are contained by any active root are dropped from excludesOverlay.
  - Implemented leaf-glob re-inclusion: collected tails from inactive leaf-glob excludes (e.g., “**/\*.test.ts”) and added scoped anchors “<activeRoot>/**/<tail>” for each active root.
  - Preserved ramp-up safety for subtree roots only; leaf-globs do not trigger auto-suspend on their own.
  - Reserved denials remain enforced by core (anchors cannot override).

- Facet overlay — tests added
  - equal-root overlap: inactive “docs” dropped when “docs” is active.
  - parent/child overlap: inactive “packages/**” dropped when “packages/app/**” is active.
  - leaf-glob scoping: added “src/**/\*.test.ts” anchor when leaf-glob is inactive and “src/**” is active.

- Overlay diagnostics
  - Record per‑facet `overlapKept` counts (inactive subtree roots retained after enabled‑wins filtering) in `.stan/system/.docs.meta.json.overlay` to aid troubleshooting of overlap filtering.

- Overlay diagnostics follow‑through
  - Added `overlapKeptCounts` to the overlay fallback in `src/cli/run/action.ts` to satisfy the extended `FacetOverlayOutput` type.
  - Hardened CLI config loader under SSR by guarding the `ensureNoReservedScriptKeys` call; prevents rare “not a function” errors in tests while keeping strict validation on the primary path.
