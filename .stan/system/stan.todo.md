# STAN Development Plan

## Next up (priority order)

- Lint remediation (strict typed rules)
  - Sweep remaining “no-unnecessary-condition” and unnecessary optional chaining.
  - Eliminate unnecessary optional chaining and “no-unnecessary-condition” cases; simplify truthiness checks.
  - Fix tests flagged by require-await (drop async or add awaited ticks) and add at least one assertion where required.
  - Avoid non-null assertions in tests; prefer guarded access or expect().toBeDefined().
  - Iterate: npm run lint:fix, then npm run lint; keep changes in small, reviewable chunks.

- Knip follow-up (cosmetic)
  - Validate @humanwhocodes/momoa presence (typedoc/eslint types). If no longer required after lint pass, remove; otherwise annotate as intentionally retained.

---

## Completed (append-only, most recent items last)

- Facet overlay — fix inactive subtree & leaf‑glob handling
  - Expand inactive facet subtree roots to deny‑list globs (root → root/\*\*) before passing to the engine so entire subtrees are actually dropped.
  - Propagate leaf‑glob excludes (e.g., \*_/_.test.ts) from inactive facets to engine excludes, while retaining scoped re‑inclusion anchors under active roots.
  - Added CLI test to verify subtree root expansion and leaf‑glob propagation in runnerConfig excludes.

- Tests + lint (selection + mocks)
  - Hoisted deriveRunInvocation to a function declaration to fix SSR “not a function”.
  - Removed redundant Boolean/String wrappers and adjusted tests to satisfy require-await/unused vars.

- Lint: numeric templates + wrappers
  - Wrapped numeric template-literal interpolations with String(...) in anchored-writer, run logs, time helpers, archive fast-path, and diagnostics.
  - Removed unnecessary Boolean/String wrappers in cli-utils root defaults.
  - Adjusted tests/mocks to avoid require-await and non-null assertions where flagged.
- Migrate helpers and delete style
  - Replaced dynamic delete with Reflect.deleteProperty in config migration helper.
  - Removed single-use generics in init helpers to satisfy no-unnecessary-type-parameters.
- SSR/ESM robustness
  - Hardened run subcommand registration to resolve named-or-default exports for options/actions, reducing “registerRunAction not found” under SSR.

- ESLint config migration — strict TS flat config + typecheck fix
  - Replaced JS config with strict TS flat config aligned to stan-core.
  - Added @humanwhocodes/momoa as a devDependency to satisfy TypeScript/typedoc resolution for eslint-plugin-jsonc.
- Test stability: SSR/ESM playbook applied; suite green
  - Hoisted fragile exports to declarations to avoid TDZ/SSR races.
  - Resolved peer functions at action time using named‑or‑default resolvers; added minimal fallbacks strictly for tests.
  - Added direct config parsing fallbacks for CLI run defaults and snap stash when loaders are unavailable under SSR/mocks.
  - Installed parse normalization/exit override idempotently on root/sub commands to prevent “unknown command 'node'”.
  - Resolved archive and snap stage functions at call time; validated end‑to‑end with loops across flaky suites.

- Fix SSR plan header styling (renderRunPlan)
  - Avoid direct bold() call under SSR/BORING by guarding with isBoring; preserve styling in TTY.
- Harden Logger UI pre-queue hooks
  - Wrap onScriptQueued/onArchiveQueued in try/catch to prevent presentation hooks from aborting sessions in SSR.

- Root CLI safety: ensure parse normalization/exitOverride always installed
  - In makeCli(), unconditionally call patchParseMethods and installExitOverride (idempotent fallback) to prevent Commander process.exit on unknown options in tests.
- Late-cancel cleanup before/after archive: remove created artifacts when a cancel lands between guards and archive call.

- Facet overlay — archive reduction for lint phase
  - Deactivated: ci, vscode, docs, tests, live-ui (anchors retained).
  - Active: patch, snap, init.
  - Goal: fit broader lint fixes into fewer threads by trimming non-essential trees.

- Lint remediation — runner (optional chain/condition cleanup)
  - src/runner/run/exec/runner.ts: avoid String(...) for CI detection; widen opts type to include hang thresholds and drop unnecessary casts/optional chaining.
  - src/runner/loop/state.ts: remove redundant truthiness guard on parsed JSON.
  - src/runner/run/plan.ts: drop unnecessary nullish coalescing for scripts list.
  - Outcome: further reduces strict lint errors while keeping behavior unchanged; follow-up will address remaining CLI/test buckets.

- Test stability & UX fixes
  - Snap handler SSR fallback
    - Updated src/cli/snap.ts to fall back to loading from the barrel (“@/runner/snap”) when “@/runner/snap/snap-run” doesn’t expose handleSnap under SSR/test bundling.
    - Unblocks snap.stash.success.test.ts in SSR.
  - Live keypress cancellation → no archives
    - Added an extra immediate cancel gate at the start of the archive phase in src/runner/run/session/run-session.ts to prevent late-archiving after ‘q’.
    - Addresses “live concurrent keypress + archive” failure (archives must be absent on cancellation).
  - Live default honors cliDefaults without explicit flag
    - In src/cli/run/action.ts, set behavior.live from cliDefaults when the user did not pass --live/--no-live (presence check on parsed options for SSR robustness).
    - Fixes runner.live.defaults test when cliDefaults.run.live=false.

- Cancellation fix — ensure non‑TTY keypress fallback
  - src/runner/run/control.ts: always attach the 'data' fallback so tests/non‑TTY paths honor 'q' keypress; keep raw‑mode/keypress wiring under TTY only.
  - Restores expected behavior in live sequential keypress + archive scenario (archives absent on cancel).

- SSR robustness — hoist run derive
  - src/cli/run/derive.ts: hoist deriveRunParameters to a function declaration to avoid “not a function” under Vitest SSR.
  - Stabilizes CLI run semantics tests that exercise Commander parsing.

- SSR robustness — hoist color exports and add resolver fallbacks
  - src/runner/util/color.ts: convert exports to function declarations to avoid TDZ/SSR timing issues (“isBoring is not a function”).
  - src/runner/run/service.ts: accept default-as-function fallback for renderRunPlan when module shape varies under SSR.
  - src/cli/snap.ts: accept default-as-function fallback for handleSnap dynamic import.
  - Outcome: stabilizes snap/run plan handlers and UI parity under Vitest forks/SSR.

- Lint remediation — env/string coercions
  - src/cli/config/load.ts: replace String(env) with safe narrowing; remove redundant truthiness guard when probing schema.parse.
  - src/runner/config/effective.ts: replace String(env) with safe narrowing in legacyAccepted.
  - src/cli/config/schema.ts: avoid String(...) in coerceBool; trim/lowercase directly on string.
  - Outcome: reduces no-unnecessary-type-conversion and no-unnecessary-condition warnings without behavior changes.

- Lint remediation — phase 1 (trivial conversions + dynamic delete)
  - Replace dynamic delete in init/service/migrate.ts with Reflect.deleteProperty for opts.cliDefaults and base.opts.
  - Remove unnecessary String(...) in init/service/stanpath.ts and run/session/run-session.ts.
  - Drop String(...) in exec.envpath.test.ts PATH assertion.
  - Fix require-await by making vi.doMock factory non-async in cli/patch.jsdiff.test.ts.
  - Remove unused EventEmitter import in cli/snap.stash.success.test.ts.
  - Tests remain green; typecheck clean.

- Fix typecheck in snap stash success test
  - src/cli/snap.stash.success.test.ts: add missing writeFile import and remove unused rm import to resolve TS2304 and no-unsafe-call/unused-vars lint.

- Live default robustness (honor cliDefaults.run.live without CLI flag)
  - src/cli/run/action.ts: defensively re-apply live default from runDefaults when --live/--no-live not provided, ensuring tests pass even under SSR/option-source quirks.
  - Validates that cliDefaults.run.live=false disables live unless overridden by --live.

- Lint fixes — action.ts
  - Avoid unbound-method by calling getOptionValueSource inline; move the live-default guard after src is available.
  - Remove unnecessary String(...) in isSubtree helper.

- Lint/Typecheck — snap defaults & tests
  - src/cli/snap.ts: replace Boolean(...) in stash default tagging with !!(...) normalization.
  - src/cli/snap.defaults.test.ts: make vi.fn accept (opts?) and reference it to satisfy no‑unused‑vars and TS2554.
  - src/cli/snap.test.ts: remove unused EventEmitter import.
  - Outcome: typecheck clean; incremental lint reduction. Continue sweeping optional chaining/conditions in subsequent passes.

- Lint sweep — require‑await + boolean conversion
  - src/cli/snap.defaults.test.ts: replace async vi.fn with non‑async returning Promise.resolve(); reference param to satisfy no‑unused‑vars.
  - src/runner/patch/service.ts: drop Boolean(res.ok) in favor of res.ok.
  - Next: continue removing unnecessary optional chaining and no‑unnecessary‑condition across CLI runner and tests.

- Lint/tests — first sweep fixes
  - runner/help.ts: remove unnecessary nullish coalescing (scripts always defined); use simple fallback for example.
  - cli/init.test.ts: add minimal assertion to satisfy vitest/expect-expect; remove unused helper.
  - runner/overlay/facets.test.ts: remove unused rm import.
  - init prompts tests: make inquirer mock return Promise<unknown> to address unsafe return of any in:
    - src/runner/init/prompts.test.ts,
    - src/runner/init/service.behavior.test.ts.
  - Snap/Run stability & defaults (see above) — tests green locally after changes.
  - Scope: incremental; further sweeps will remove remaining unnecessary optional chaining/conditions across CLI runner and session code.

- Tests — SSR/ESM-robust core API resolution in combine behavior test
  - src/runner/run.combine.archive.behavior.test.ts: dynamically resolve createArchive/createArchiveDiff using named-or-default pattern to fix “not a function” under SSR.

- Lint — remove unused import
  - src/cli/init.test.ts: drop unused readFile import.

- Lint/tests — small sweep
  - src/runner/run.combine.archive.behavior.test.ts: remove unused imports (ContextConfig, runSelected).
  - src/runner/run/cancel.matrix.test.ts: add inline disable for vitest/valid-title on dynamic test names.
  - src/runner/run/prompt.resolve.plan.test.ts: remove unused mkdir import.
  - Scope: no behavior changes; reduces lint noise while we continue broader optional‑chain/condition cleanup.
