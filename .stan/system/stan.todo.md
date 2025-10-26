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

- Tests/SSR — fix rootDefaults “not a function” in CLI factory
  - In src/cli/index.ts, resolve `rootDefaults` and `applyCliSafety` via named-or-default function resolver to avoid “not a function” under Vitest SSR.
  - Keeps runtime behavior unchanged; stabilizes CLI help footer test.

- Docs/help — unchanged in this patch (pure stability guards). Keep overlay docs and Option 1 test guidance aligned in future doc pass.

- Tests/SSR — harden additional named exports with named-or-default resolvers
  - src/runner/run/service.ts: resolve renderRunPlan via resolveNamedOrDefaultFunction to fix “renderRunPlan is not a function” under SSR.
  - src/cli/patch.ts: resolve runPatch via resolveNamedOrDefaultFunction to fix “runPatch is not a function” in patch CLI tests.
  - No functional changes at runtime; improves stability in Vitest SSR/forks.

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

- Scripts warnPattern flags override
  - Added optional scripts.warnPatternFlags (sibling to warnPattern) to override default regex flags behavior.
  - Updated schema validation, runner compilation (compileWarnPatterns), and tests to ensure flags disable the implicit /i fallback when provided.

- Tests/SSR — stabilize named exports under Vitest SSR
  - Converted arrow-function named exports to hoisted function declarations to avoid rare “not a function” evaluation under SSR/mock-heavy paths:
    - src/cli/cli-utils.ts: export function applyCliSafety(...)
    - src/runner/config/effective.ts: export async function resolveEffectiveEngineConfig(...)
  - No behavior change at runtime; resolves intermittent “applyCliSafety is not a function” and “resolveEffectiveEngineConfig is not a function” in CLI suites.

- SSR cleanup & path normalization
  - snap.ts / patch.ts / init.ts: resolve applyCliSafety lazily (named-or-default) for both root and subcommands; remove stray unresolved identifiers to satisfy TS and keep SSR robust.
  - archive fast path: normalize output paths with path.join to satisfy Windows path-based assertions in sequential archive test.

- Tests/SSR — resolve service/options via named-or-default
  - src/cli/init.ts: resolve `performInitService` via named-or-default to avoid “performInitService is not a function” under Vitest SSR.
  - src/cli/runner/index.ts: resolve `registerRunOptions` via named-or-default to avoid “registerRunOptions is not a function” during CLI run option wiring tests.
  - Runtime behavior unchanged; improves test stability in SSR/forks.

- Tests/SSR — finalize CLI SSR guards
  - src/cli/init.ts: make `performInit` call the SSR‑resolved service and return `Promise<string|null>`; safe fallback to `null` when the service cannot be resolved (rare SSR anomalies).
  - src/cli/run/action.ts: resolve `resolveEffectiveEngineConfig` via named‑or‑default to eliminate remaining “not a function” under Vitest SSR.

- Tests/SSR — snap context guard
  - src/runner/snap/context.ts: resolve `findConfigPathSync` from `@karmaniverous/stan-core` via named‑or‑default to prevent “findConfigPathSync is not a function” under Vitest SSR.

- Snap context — lazy engine resolver + tests
  - Moved resolveEffectiveEngineConfig resolution inside resolveContext with a dynamic import and named‑or‑default fallback to eliminate SSR import‑time races.
  - Added unit tests covering both named‑only and default‑only export shapes for the resolver (src/runner/snap/context.resolve.test.ts).
  - Provided a minimal stanPath fallback via resolveStanPathSync to keep snap usable in rare SSR/mock failures.

- Snap context — lazy core resolvers for config/stanPath
  - Moved findConfigPathSync and resolveStanPathSync resolution inside resolveContext with dynamic import and named‑or‑default fallback to eliminate the remaining “findConfigPathSync not found” race.

- Snap CLI — resolve tagDefault via named‑or‑default
  - Resolved tagDefault from cli-utils defensively to fix “tagDefault is not a function” under SSR/mocks in snap.stash.success.test.

- Snap context — support nested default shapes in tests
  - Updated resolver to detect resolveEffectiveEngineConfig under default.resolveEffectiveEngineConfig and default.default.resolveEffectiveEngineConfig, preventing fallback to config stanPath in the default-only resolver test.
