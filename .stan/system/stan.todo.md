# STAN Development Plan

When updated: 2025-10-12 (UTC)

This plan tracks near‑term and follow‑through work for the stan‑cli package (CLI and runner). The stan‑core split is complete; engine work is tracked in the stan‑core repository.

---

## Next up (priority order)

1. Silent fallback audit and debug logging
   - Add debug logging (enabled when STAN_DEBUG=1) to every code path that diverts from the happy path via a fallback (e.g., config load fallback, stanPath resolution fallback, CLI defaults derivation fallback, prompt source resolution fallback, snapshotless diff/archiving fallbacks, archive warning fallbacks, etc.).
   - Introduce a tiny centralized helper to record fallback origin (module:function) and succinct reason, ensuring consistent formatting and easy grepping.
   - No behavior change in normal mode; only emit these notices under debug.

2. Default stanPath fallback hygiene
   - Replace any 'stan' literal fallback with DEFAULT_STAN_PATH (".stan") or resolveStanPathSync() across the CLI surfaces (run/patch/snap/init/helpers).
   - Add a unit test to assert that fallback stanPath is ".stan" and that no unexpected "stan" directory is created on failure paths.

3. Docs & help updates (reflect new --prompt and environment rules)

---

## Backlog / follow‑through

- Snapshot UX follow‑through
  - Improve `snap info` formatting (clearer current index marking; optional time‑ago column).

- Live UI niceties (post‑stabilization)
  - Optional Output column truncation to available columns (avoid terminal wrapping when paths are long).
  - Optional alt‑screen mode (opt‑in; disabled by default).

- Docs/site
  - Expand troubleshooting for “system prompt not found” and PATH issues with suggestions (`--prompt core`, install missing devDeps, or invoke via package manager).
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
- Tests:
  - Coverage for PATH augmentation (repo bin precedence). [DONE]
  - (Follow‑through) Add coverage for prompt plan line and early failure cases.

---

## Completed (recent)

- Script runner environment — PATH augmentation
  - Added PATH augmentation before each script spawn so repo binaries resolve without global installs.
  - Behavior:
    - Prefix child PATH with `<repoRoot>/node_modules/.bin` and each ancestor `<dir>/node_modules/.bin` up to the filesystem root (nearest first).
    - Cross‑platform: use `path.delimiter`; set `PATH` (Windows case‑insensitive).
    - No command rewriting; preserve `cwd=repoRoot`, `shell=true`; pass through parent env with augmented PATH.
    - No runtime deps added for user tools (e.g., `cross-env`).
    - If no `.bin` exists (e.g., Yarn PnP), augmentation is a no‑op.
  - Tests:
    - Added a test to verify child PATH is prefixed with `<repoRoot>/node_modules/.bin` and visible in the script output.

- System prompt selection in run
  - Added `-m, --prompt <value>` with default `auto` and support for `cliDefaults.run.prompt`.
  - Resolution rules:
    - auto: prefer local `<stanPath>/system/stan.system.md`, fallback core (packaged).
    - local/core/path: require existence; early, concise error if not found (no scripts/archives).
  - Materialization:
    - Present chosen prompt under `<stanPath>/system/stan.system.md` for both full and diff; restore previous state after archiving; avoid gratuitous rewrites by byte-compare.
  - Plan header includes `prompt:` line with resolved source (e.g., `auto → core (@karmaniverous/stan-core@X.Y.Z)`).
  - Removed run/snap preflight drift/docs prints and updated tests accordingly (removed preflight tests).

- Live/Logger parity and stability
  - Final‑frame newline; stable hint behavior; BORING tokens in logger.
  - Sequential scheduler gate prevents post‑cancel spawns; archives skipped on cancel; non‑zero exit.
  - Anchored writer ensures in‑place updates without scrollback loss; hides/shows cursor reliably.

- Patch classification and diagnostics hardening
  - File Ops vs Diff split with FO‑only acceptance; single‑file diff enforcement; diagnostics envelopes with declared paths and attempt summaries; editor open on success (non‑check); `.patch` persisted for audit.

- CLI config & defaults
  - Root defaults for `debug`/`boring` respected; run defaults surfaced in help (Commander default annotations).
  - Plan printing toggles (`-p`/`-P`) honored; plan only exits without side effects.
- Lint cleanup (tsdoc/unused/reduntant/require‑await)
  - Fix TSDoc “escape greater‑than” in comments:
    - src/cli/stan/cli-utils.ts (Normalize argv doc)
    - src/stan/run/exec.ts (selection doc bullets)
  - Remove unnecessary backslash in a TSDoc string (live renderer) to avoid tsdoc‑unnecessary‑backslash.
  - Prompt pipeline:
    - Simplify PromptChoice type (remove redundant union with string).
    - Make resolvePromptSource synchronous (remove require‑await; callers may still await safely).
  - Session:
    - Remove unused import and variable; annotate empty catches with comments to satisfy no‑empty.
  - Snap:
    - Remove unused preflight import.

- Lint follow‑through:
  - Remove unnecessary `await` before `resolvePromptSource` in `src/stan/run/session.ts` to satisfy `@typescript-eslint/await-thenable`.

- Module decomposition convention (directory + index.ts barrel)
  - Adopted a project‑level directive: when decomposing a file `X.ts`, create `X/` with decomposed modules and `X/index.ts` re‑exports; delete `X.ts`. This preserves import paths (`./X`).
  - Applied to the exec module:
    - Removed `src/stan/run/exec.ts` (legacy barrel).
    - Added `src/stan/run/exec/index.ts` that re‑exports from `runner.ts`.
  - Applied to other duplicates:
    - Replaced `src/cli/stan/runner.ts` with `src/cli/stan/runner/index.ts` (barrel).
    - Moved CLI bootstrap from `src/cli/stan/stan.ts` to `src/cli/bin/stan.ts` to avoid a sibling file/folder conflict and follow the convention.
    - Updated Rollup to prefer a single CLI entry (`src/cli/bin/stan.ts`) and updated the dev script (`npm run stan`) accordingly.

Notes:

- The large session orchestrator remains in `src/stan/run/session.ts`. Converting it to `session/index.ts` will be handled as a follow‑up split (file exceeds the long‑file threshold; requires a decomposition plan).

- Debug/live interaction (Option C)
  - Decided that `--debug` forces `--no-live` strictly to avoid live table corruption by debug messages.
  - Implementation: on `stan run`, when debug is active, always set `live=false`. If both `--debug` and `--live` are explicitly passed, print a warning and ignore `--live`.
  - Tests/docs follow‑through planned alongside the live view debugging exploration.

- Decomposed session orchestrator (directory + index.ts)
  - Replaced `src/stan/run/session.ts` with `src/stan/run/session/index.ts` (orchestrator ≤300 LOC).
  - Introduced `src/stan/run/session/types.ts`, `cancel-controller.ts`, and `scripts-phase.ts` to keep the orchestrator small and testable.
  - Existing helpers (`prompt-plan`, `archive-stage`, `signals`, `ui-queue`) reused intact.
  - Fixed a lingering test import (`src/stan/run/plan.test.ts`) to the run barrel.

- Snap tests — namespaced config alignment
  - Updated snapshot/selection tests to write a namespaced `stan.config.yml` (`stan-core` for engine keys; `stan-cli` for CLI keys).
  - Fixed failures caused by stan-core’s strict loader (“missing ‘stan-core’ section”) and a mismatched `stanPath` during history navigation.
  - Tests now target the correct `out/diff` state and pass deterministically under the new config model.