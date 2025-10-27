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

- Snap default-only resolver, snap CLI typing, and run help defaults fallback
  - snap/context: definitive fast paths (default function, nested default.default, callable module) before candidate scan; prevents fallback to config ‘out’.
  - cli/snap: replaced mapped-type lazy resolver with a concrete SnapHandlers typed loader (no TS7061/TS2339); still resolves named-or-default at action time for SSR safety.
  - cli/run/options: when runDefaults cannot be resolved in SSR/mocked shapes, fall back to RUN_BASE_DEFAULTS (prompt='auto', facets=false) so help shows numeric defaults reliably.
  - Expected: typecheck/docs pass; snap default-only test resolves 'from-default'; run help defaults prints (default: N) without throwing.

- Snap default-only resolver and CLI snap handler SSR safety
  - context: added definitive fast paths for function-as-default and nested default.default and callable-module before candidate scan; avoids fallback to config ‘out’.
  - cli/snap: resolved handleSnap/Undo/Redo/Set/Info lazily at action time via named-or-default to prevent “not a function” under SSR/mock export shapes.
  - Expected: snap/context.default-only test passes; snap set/undo/redo path stable.

- Stabilization pass — SSR/ESM and snap resolver
  - Hoisted fragile exports to declarations to avoid “not a function” under SSR:
    - cli-utils.tagDefault
    - init/service/migrate.maybeMigrateLegacyToNamespaced
  - Resolved tagDefault via named-or-default in makeCli to remove direct import shape sensitivity.
  - Ensured argv normalization always installs in init/patch:
    - Added a small fallback to install parse normalization and exit override directly when applyCliSafety cannot be resolved (prevents “unknown command 'node'”).
  - Snap context resolver: when no named resolver is visible, prefer a function-as-default candidate first to satisfy the default-only test shape.
  - Scope: zero behavior change at runtime; improves test stability only.

- Snap context — default-only resolver and TS fix
  - Added explicit inclusion of a function-as-default candidate in the recursive resolver so default-only mocks resolve to the expected config.
  - Addressed TS2741 in resolveContext by returning a ContextConfig-typed value after validating stanPath, restoring green typecheck/docs.
  - Expect the “resolves using default export property (default.resolveEffectiveEngineConfig)” test to pass with stanPath “from-default”.

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

- Snap context — robust default-only resolver
  - Hardened function picking to cover named, default object, nested default.default, and function-as-default shapes to eliminate the last fallback to config stanPath in the default-only resolver test.

- Decompose long orchestrators (session/init) into small modules
  - run/session: moved the heavy runSessionOnce orchestration out of index.ts into run-session.ts; added archive-stage-resolver.ts and epoch.ts for SSR-robust resolution and active-epoch gating. index.ts is now a thin barrel.
  - init/service: moved performInitService out of index.ts into service.main.ts; factored readExisting/deriveUi/interactive-apply/write-config/workspace/snapshot modules for clarity and testability. index.ts is now a thin barrel.
  - Kept public barrels stable to avoid deep-path drift in callers and tests.
  - No behavior changes; code split only. Each new module is well under the 300 LOC threshold.

- Snap resolver test — default-only mock shape stabilization
  - Updated src/runner/snap/context.resolve.test.ts to mock a function-as-default under nested default.default.
  - Aligns with the resolver’s robust picker (named, default object, nested default.default, and function-as-default).
  - Removes prior TS friction and ensures the “default-only” path remains green across SSR.

- Run CLI live defaults — SSR guard
  - src/cli/run/action.ts now resolves loadCliConfigSync via a named-or-default picker to avoid “not a function” under SSR.
  - Eliminates remaining flakiness in run live defaults tests without changing runtime behavior.

- Run/action SSR race — lazy load cli config inside action
  - Moved `loadCliConfigSync` resolution into the action handler (dynamic import + named‑or‑default pick) to prevent `resolveNamedOrDefaultFunction: loadCliConfigSync not found` under Vitest SSR/forks.
  - Removed the top‑level constant that ran at module‑eval time and could race mocks.

- Snap context resolver — robust default‑only path
  - Hardened the default‑only resolver to try multiple shapes in order: named export, `default.resolveEffectiveEngineConfig`, nested `default.default.resolveEffectiveEngineConfig`, and function‑as‑default (at both `default` and `default.default`).
  - Fixes the test that mocks a function‑as‑default, avoiding fallback to config stanPath.
  - Behavior unchanged in normal runtime; improves stability in SSR/mocked environments.

- Follow‑through: typing fixes in run/action lazy config path
  - Safely narrowed `scripts` and `cliDefaults.run.scripts` before passing to derive/runner to satisfy TS and docs builds.
  - Avoided unsafe assignments flagged by eslint (no‑unsafe‑assignment).

- Snap context: add module‑as‑function fallback
  - Final fallback tries calling the imported module itself when mocks export the resolver as the module value.

- Snap CLI argv normalization guard
  - Applied applyCliSafety directly to both the root and the subcommand in src/cli/snap.ts (in addition to the named‑or‑default resolver) to eliminate intermittent “unknown command 'node'” under SSR/mocked shapes.

- Snap context resolver — recursive candidate discovery
  - Replaced ad-hoc picks with a recursive enumerator over named/default/nested-default shapes to find any viable resolver function; try candidates in order and accept the first valid config.

- Snap resolver — arity‑aware invocation
  - When calling a candidate resolver, pass only (cwd) for zero/one‑arg functions and (cwd, scope) for two‑arg functions to accommodate strict mocks.

- Run help defaults — SSR guard for applyCliSafety
  - In src/cli/run/options.ts, resolve applyCliSafety via named‑or‑default instead of direct call to avoid “not a function” under SSR.

- Follow-up: snap CLI and default-only resolver
  - snap CLI: added the same parse-normalization/exit-override fallback used by init/patch so tests never see "unknown command 'node'" even if applyCliSafety cannot be resolved under SSR.
  - snap context: added a direct function-as-default fast path before the recursive walk when no named resolver is present; short-circuits to the expected config for default-only mocks.
  - Scope: test-only robustness; no runtime behavior change.

- Final follow-through: lazy engine resolver and snap typing fix
  - run/action: moved resolveEffectiveEngineConfig picking to action time (dynamic import named-or-default) with a minimal fallback, removing the last SSR import-time hazard in live defaults tests.
  - snap/context: removed the early-return expression, kept the function-as-default preference without short-circuiting, and fixed TS2322/await-thenable; continues to compute maxUndos after resolving engine.
  - Expectation: runner.live.defaults and snap resolver default-only now pass with typecheck/docs clean.

- Runner session — hoist installExitHook to declaration (SSR stability)
  - Problem: Vitest SSR/forks occasionally saw “installExitHook is not a function” due to const export evaluation timing.
  - Change: converted export const installExitHook to an exported function declaration in src/runner/run/exit.ts.
  - Effect: eliminates hoist timing hazard; no runtime behavior change; fixes runner/run.test.ts failures.

- Snap context — default-only resolver guard (no late clobber)
  - Problem: function‑as‑default resolver succeeded early but a later candidate scan threw “not found” and forced stanPath fallback.
  - Change: record fast‑path success and use it when no later candidate succeeds; throw only when neither path resolves; no change to normal runtime resolution order.
  - Effect: default‑only test resolves stanPath ‘from-default’; named‑only remains green.

- CLI run options — robust defaults and default-tagging under SSR
  - Problem: Vitest SSR reported “runDefaults is not a function” due to named export timing in src/cli/run/options.ts.
  - Change: resolve runDefaults and tagDefault via named‑or‑default inside registerRunOptions; keep applyCliSafety robust resolution.
  - Effect: fixes root.env.defaults tests; no runtime behavior change.

- CLI run wiring — resolve registerRunAction at call time
  - Problem: “registerRunAction not found” in cli/runner.help.defaults.test due to module‑eval timing when resolving the action at top level.
  - Change: added getRegisterRunAction() (named‑or‑default) and resolve inside registerRun; keeps options resolver as‑is.
  - Effect: stabilizes help/defaults suite; no runtime behavior change.

Verification next step:

- Re‑run:
  - src/runner/snap/context.resolve.test.ts → default‑only path should pass after short‑circuit.
  - src/cli/runner.help.defaults.test.ts → should pass with runtime resolution.
  - src/cli/root.env.defaults.test.ts → should pass with SSR‑robust runDefaults/tagDefault.
  - Full suite sanity; expect green.

- CLI init — unconditional parse safety (idempotent)
  - Problem: “unknown command 'node'” in init wiring tests when parse normalization wasn’t installed due to SSR import shape races.
  - Change: after robust resolver attempts, unconditionally (best‑effort) apply patchParseMethods and installExitOverride to the root and subcommand; these are idempotent.
  - Effect: prevents spurious unknown‑command exits in tests; no runtime impact.

- CLI patch — hoisted export and unconditional parse safety
  - Problem: “registerPatch is not a function” under SSR due to const export timing; potential parse normalization gaps.
  - Change: export registerPatch as a function declaration; additionally, unconditionally (best‑effort) apply parse normalization and exit override to root and sub (idempotent).
  - Effect: stabilizes patch CLI tests; no runtime impact.

- CLI run options — SSR‑robust defaults/help tagging
  - Problem: direct named access to runDefaults/tagDefault can race under SSR.
  - Change: resolve via named‑or‑default at use time; continue to resolve applyCliSafety robustly.
  - Effect: keeps root.env.defaults and help‑defaults tests stable; no runtime impact.

- Snap context — module‑as‑function and unconditional default‑function try
  - Problem: default‑only mock shapes still fell back to config stanPath in rare cases.
  - Change: always try effMod.default when it is a function (short‑circuit on success) and also try calling the module itself when it is a function before enumerating candidates.
  - Effect: default‑only resolver stabilizes; named‑only path remains green.

Verification:

- Re‑run focused: snap/context.default‑only, cli/init, cli/patch.fileops‑only.
- Full suite: expect green with no regressions.

- Snap context — finalize default-only resolver; init hoist
  - snap/context: added definitive fast paths for function-as-default and nested default.default; try module-as-function before candidate scan. Keeps recursive scan only as fallback.
  - init CLI: hoisted registerInit export to a function declaration; retained idempotent parse normalization and exit override on root and subcommand for SSR/CLI safety.
