# STAN — Requirements (stan-cli)

This document defines the durable requirements for STAN’s command‑line interface and runner (“stan‑cli”). The engine (“stan‑core”) exposes deterministic, presentation‑free services; stan‑cli remains a thin adapter over those services.

The requirements below express the desired end‑state behavior of the CLI, including facet overlay semantics and test infrastructure choices.

---

## 1) Purpose and scope

Provide a stable CLI that:

- Runs configured scripts and produces deterministic text outputs.
- Creates full and diff archives that capture the exact context to read.
- Applies unified‑diff patches safely and emits concise diagnostics when needed.
- Presents a live TTY UI (or logger output in non‑TTY) and robust cancellation.
- Manages an optional facet overlay to reduce archive size without losing breadcrumbs.
- Resolves and materializes the system prompt deterministically.
- Stays transport‑agnostic by delegating selection/diff/patch to stan‑core.

Out of scope for the CLI:

- File selection algorithms, archiving/diffing, or patch application logic (owned by stan‑core).
- Persisting large or non‑deterministic artifacts outside the STAN workspace.

---

## 2b) Workspace context (-w)

- Global option: `-w, --workspace <query>` (root command).
- Behavior: changes `process.chdir()` to the target directory *before* loading config or executing subcommands.
- Resolution:
  1. Directory: if `<query>` is a valid relative path, switch to it.
  2. Package name: parse `pnpm-workspace.yaml` (or `package.json` workspaces), find exact package name match, switch to its root.
- Feedback: log the context switch to console ("stan: switched context to ...").

---

## 2) Architecture and boundaries (CLI ↔ Core)

- CLI (adapters/presentation)
  - Acquire inputs (flags, clipboard, files), map them to core service inputs.
  - Render live progress or concise logs; handle TTY controls and exit codes.
  - Compose overlay (facets → includes/excludes/anchors); do not re‑implement core selection.
  - Open editors best‑effort; copy diagnostics to clipboard best‑effort.

- Core (services/pure behavior)
  - Configuration, selection, archiving, snapshotting, patch pipeline, imports staging, and response validation.
  - Presentation‑free; no console I/O. All warnings/notes surface via return values or optional callbacks.
  - Public helpers for prompt packaging and monolith assembly.

The engine remains swappable; the CLI must not assume engine location or bundling flavor.

---

## 3) Run (build & snapshot)

- Execute scripts
  - Default: concurrent; `-q/--sequential` preserves provided order (or config order when not enumerated).
  - Capture combined stdout/stderr to `<stanPath>/output/<key>.txt`, ensuring the file exists even if cancelled early.

- PATH augmentation (child processes)
  - Prepend nearest‑first chain of `node_modules/.bin` directories from repo root up to the filesystem root.
  - Cross‑platform: build with `path.delimiter`, set key as `PATH` (Node normalizes case on Windows).
  - No command rewriting; do not inject `npx`/`npm exec`. Augmentation is a no‑op when `.bin` folders are absent (e.g., PnP).

- Archives
  - `archive.tar` (full), `archive.diff.tar` (changed files since snapshot).
  - Combine mode (`-c/--combine`): include `<stanPath>/output` entries in archives and remove them from disk afterward; archives remain on disk.
  - Exclusion/classification (surfaced by core via callbacks/returns): binaries excluded; large text call‑outs are logged by the CLI only if surfaced from core.

- Plan and live UI
  - Print a multi‑line plan unless `-P/--no-plan`.
  - Live TTY table with cancellation keys (‘q’ cancel, ‘r’ restart session); logger lines in non‑TTY.

- Cancellation
  - SIGINT parity for live/non‑live.
  - Sequential scheduler gate prevents new spawns after cancel.
  - Archives are skipped on a cancelled session; non‑zero exit (best‑effort).

## 3b) Context Mode (New Selection Model)

- Configuration: `cliDefaults.run.context` (boolean).
- Flags:
  - `--context`: Enable context mode (mutually exclusive with Facets).
  - `--no-context`: Disable context mode.
  - `--meta` (long only): Bootstrap mode.
    - Requires Context Mode.
    - Generates an archive containing **ONLY** the System files (Prompts, Plans, Requirements), Staged Imports, and the Dependency Graph.
    - Ignores source files (treats `context.meta.json` as empty).
    - Used at the start of a thread to give the AI the "Map" without the "Territory".
- When Context Mode is active, Facets are disabled.

---

## 4) System prompt resolution and materialization

- Flag: `-m, --prompt <value>` where `<value>` ∈ {'auto' | 'local' | 'core' | <path>}; default 'auto'.
- Resolution:
  - local: require `<stanPath>/system/stan.system.md`; error if missing.
  - core: require packaged baseline from stan‑core (`getPackagedSystemPromptPath()`); error if missing.
  - auto: prefer local, fall back to core; error if neither available.
  - <path>: absolute or repo‑relative path; must exist.
- Materialization & diff:
  - The resolved source is materialized at `<stanPath>/system/stan.system.md` for the archive phase, then restored if replaced (write‑only when bytes differ).
  - Full archive always includes the file; diff includes it only when changed vs snapshot.
- Plan header:
  - Plan includes `prompt: …` with effective resolution (e.g., `auto → local (.stan/system/stan.system.md)`).
- No drift/version printing in `run` (preflight belongs elsewhere).

---

## 5) Patch (discuss & apply)

- Source precedence: argument → `-f/--file [filename]` (or configured default unless `-F/--no-file`) → clipboard.
- Kind classification:
  - File Ops only: structural verbs (mv/cp/rm/rmdir/mkdirp). Many operations allowed; dry‑run under `--check`.
  - Unified‑diff only: exactly one file per patch block (hard rule).
  - Mixed (“File Ops + Diff” in one payload) is invalid → compose diagnostics.
- Persistence/audit:
  - Save raw patch to `<stanPath>/patch/.patch`. Store rejects in `<stanPath>/patch/rejects/<UTC>/` when applicable.
- Diagnostics envelope:
  - Concise target list, attempt summaries (git apply), jsdiff reasons (if any). Copy to clipboard best‑effort.
- Editor:
  - Open the modified file on success (non‑check) using configured command (default `code -g {file}`), best‑effort/detached.

---

## 6) Snap (share & baseline)

- Write/update `<stanPath>/diff/.archive.snapshot.json`.
- Maintain bounded undo/redo under `<stanPath>/diff` with retention `maxUndos` (default 10).
- Optional stash: `-s/--stash` (git stash -u then pop), `-S/--no-stash`. On failure to stash, abort without writing a snapshot.
- Snapshot selection equals the run‑time selection rules composed by the CLI (repo includes/excludes, overlay anchors/excludes).

---

## 7) Facet overlay (DEPRECATED)

*Note: Facets are deprecated in favor of Context Mode. The logic below applies only when Context Mode is disabled.*

Overlay lives entirely in the CLI. Core remains facet‑agnostic and receives only includes/excludes/anchors.

- Files under `<stanPath>/system/` (included in archives):
  - `facet.meta.json` (durable): facet name → `{ exclude: string[]; include: string[] }`
    - exclude: subtree or leaf‑glob patterns to drop when inactive and overlay enabled.
    - include: “anchors” that must always be kept (e.g., READMEs, indices).
  - `facet.state.json` (ephemeral): name → boolean; `true` = active (no drop), `false` = inactive (drop its exclude patterns). Omitted facets default to active.

Facet kinds (semantics)

- Structural facets (subtree scopes)
  - Defined by subtree patterns like `src/a/**`, `packages/**`, etc.
  - When inactive (and overlay enabled), they hide the corresponding subtree(s) except for anchor documents.
  - Nested structural facets must support refinement (e.g., enable a child subtree while keeping the rest of the parent subtree hidden).
- Filter facets (leaf-glob scopes)
  - Defined by leaf-glob patterns like `**/*.test.ts`.
  - They behave as orthogonal filters: when inactive, matching files are hidden even inside active structural facets; when active, they do not force visibility outside active structural facets.
  - In particular, enabling a filter facet must never cause matching files to appear inside a structural facet subtree that is inactive for the run.

Archive inclusion (full archives)

- `facet.state.json` is always included in full archives (anchored) whether or not it is gitignored. This allows downstream assistants to deterministically read the next‑run facet defaults from attached artifacts.
- `facet.state.json` should also appear in the diff archive when it has changed since the current snapshot baseline.
  - If it was not present in the snapshot baseline, it may appear once as “added” when the user changes the view mid-thread (acceptable).
- This inclusion does not override reserved denials (e.g., `.git/**`, `<stanPath>/diff/**`, `<stanPath>/patch/**`, and archive outputs under `<stanPath>/output/…`).

- Reserved denials and precedence (engine‑documented behavior, enforced by core):
  - Anchors may re‑include paths after `.gitignore` and excludes but never override reserved denials:
    - `.git/**`, `<stanPath>/diff/**`, `<stanPath>/patch/**`,
    - archive outputs (`<stanPath>/output/archive*.tar`).
  - Precedence: `excludes` override `includes`; `anchors` override both (subject to reserved denials and binary screening).

- Overlay composition (CLI algorithm):
  1. Determine effective facet activation for this run:
     - Overlay enablement (boolean, no-args):
       - `-f/--facets`: enable the facet overlay for this run.
       - `-F/--no-facets`: disable the facet overlay for this run.
     - Per-run overrides (names list; no file edits):
       - `--facets-on <names...>`: set these facets active for this run.
       - `--facets-off <names...>`: set these facets inactive for this run.
     - When overlay is enabled, effective facet state precedence (highest to lowest):
       - `--facets-on` / `--facets-off` per-run overrides (explicit wins),
       - `facet.state.json` values,
       - default for facets missing in state: active.
     - `-f/--facets` enables the overlay only; it does not implicitly activate all facets. To make everything visible, set all facets to `true` in `facet.state.json` (or avoid marking any facet `false`).
  2. Ramp‑up safety:
     - Default/state-only safety: if a facet is inactive due to `facet.state.json` (or implicit defaults) and it has no anchor present under any of its excluded subtree roots, the CLI MAY auto‑suspend the drop for this run (treat as active) and report it in the plan/metadata.
     - Explicit wins (Option Y): if the user explicitly requests `--facets-off <facet>`, the facet MUST remain inactive for that run even if it has no anchors (do not auto‑suspend explicit deactivations).
  3. Compose overlay inputs for core:
     - Start with repo `includes`/`excludes`.
     - Add excludesOverlay for inactive structural facets (subtree scopes). Nested structural facets use the carve‑out rule below.
     - Compute anchorsOverlay (union of all declared anchors + CLI-owned always-anchors such as facet.state.json), but do not use anchors to simulate filter behavior.
  4. Nested structural facets (carve‑out, not “drop parent exclude”):
     - Normalize exclude “roots” from `facet.meta.json` (strip `/**`/`/*`, drop trailing `/`).
     - Required behavior: nested facets must support these scenarios for any two nested subtree facets:
       - Include A but cut out B
       - Include B but not the rest of A
       - Include all of A (including B)
       - Include neither
     - Therefore, if an inactive subtree root contains one or more active descendant subtree roots:
       - Do not discard the inactive root exclusion.
       - Instead, compute excludes that remove everything under the inactive root except the active descendant subtree roots.
       - Practical constraint: because the engine selection uses positive glob/prefix patterns, the CLI may implement this as an on-disk carve-out by enumerating immediate children under the inactive root and excluding each child that is not an ancestor of an active descendant root.
         - Example: inactive `src/a/**` with active `src/a/b/**` results in excludes for `src/a/*` children other than `b` (and any other protected descendant roots).
  5. Filter facets (leaf‑globs; tests are a filter):
     - Leaf‑glob patterns (e.g., `**/*.test.ts`) must be treated as filters, not as re-inclusion mechanisms.
     - The CLI MUST NOT add anchors such as `<inactiveRoot>/**/<tail>` or `<activeRoot>/**/<tail>` in order to “rescue” or “scope” leaf‑glob behavior.
       - Rationale: anchors are high-precedence re-includes; using them for filters causes test files to appear inside subtrees that are otherwise disabled, which violates the filter semantics.
     - Instead:
       - When a filter facet is inactive (and overlay enabled), add its leaf‑glob patterns to the engine deny-list (`excludes`).
       - When a filter facet is active, do not add those deny-list patterns.
     - Filter facets must never override structural facets: enabling a filter facet must not surface any files inside inactive structural facet subtrees.
  6. Pass to core:
     - `includes: repo.includes`
     - `excludes: repo.excludes ∪ excludesOverlay`
     - `anchors: anchorsOverlay` (anchors are breadcrumbs, not filter machinery)

- Plan and metadata:
  - Plan “Facet view” shows overlay on/off, inactive facets, auto‑suspended facets, and anchor counts.
  - CLI updates `<stanPath>/system/.docs.meta.json.overlay` with:
    - `enabled`, `activated`, `deactivated`, `effective`, `autosuspended`, and `anchorsKept` (counts). Optional `overlapKept` may be recorded for diagnostics.

- Diff archive anchor policy:
  - The CLI must ensure the diff archive honors the same anchor set as the full archive (subject to reserved denials), so that anchored state (including gitignored state like `facet.state.json`) can appear in diffs when changed.
  - The diff archive remains “changed since snapshot” (it must not include unchanged files), except that newly introduced anchored files may appear once if they were not present in the snapshot baseline.

---

## 8) Testing and tooling (Vitest Option 1)

To minimize SSR‑related friction while keeping fast ESM testing:

- Default environment: node
  - `test.environment = 'node'` in vitest.config.ts.
  - Use DOM/happy‑dom only in suites that truly need a browser‑like environment via per‑file overrides.

- ESM‑friendly mocks (consistent shape)
  - Create a tiny helper for vi.mock/vi.doMock factories that always returns:
    - `{ __esModule: true, default: impl, ...impl }`
  - Use it for Node built‑ins and third‑party partial mocks (e.g., node:child_process, node:module, clipboardy, tar). When partially mocking, spread the actual module for unmocked members.

- Dynamic SUT import when mocks affect module evaluation
  - For suites where the subject imports mocked dependencies at module‑eval time:
    - `vi.resetModules();` install mocks; then `await import(SUT)`.
  - Prefer `vi.doMock` for clarity and control of installation order.

- CI stability
  - Consider `test.pool = 'forks'` in CI to reduce hoist/order surprises.
  - Keep `server.deps.inline: ['@karmaniverous/stan-core', 'tar']` to ensure mocks apply inside core where needed.

- Coverage
  - Keep Vitest v8 coverage for source; avoid testing built artifacts unless an explicit pipeline target requires it.

---

## 9) Configuration and defaults

- `cliDefaults` precedence: flags > `cliDefaults` > built‑ins.
- Supported keys:
  - Root: `debug`, `boring`.
  - Run: `archive`, `combine`, `keep`, `sequential`, `plan`, `live`, `hangWarn`, `hangKill`, `hangKillGrace`, `scripts`, `prompt`, `facets`.
  - Patch: `patch.file` (default filename).
  - Snap: `snap.stash`.
- Baseline run defaults:
  - `archive=true`, `combine=false`, `keep=false`, `sequential=false`, `live=true`,
  - `hangWarn=120`, `hangKill=300`, `hangKillGrace=10`, `scripts=true`, `prompt='auto'`.

---

## 10) Error handling and guardrails

- Prompt resolution failure: early error; no scripts/archives; suggest an alternative source; non‑zero exit.
- Cancellation: archives skipped on cancel path; gate prevents post‑cancel spawns; non‑zero exit best‑effort.
- Avoid spurious prompt rewrites: compare bytes before materializing; restore original or remove when done.
- Reserved denials: anchors and overlay never re‑include reserved paths; binaries remain screened by core.

---

## 11) Engine interactions (explicit)

The CLI composes these core surfaces (representative, stable):

- Config:
  - `loadConfig(cwd)`, `loadConfigSync(cwd)`, `resolveStanPath*`.
  - `ensureOutputDir(cwd, stanPath, keep)`.

- Archive/snapshot:
  - `createArchive(cwd, stanPath, { includes?, excludes?, anchors?, includeOutputDir?, onArchiveWarnings? })`
  - `createArchiveDiff({ cwd, stanPath, baseName, includes?, excludes?, anchors?, updateSnapshot, includeOutputDirInDiff?, onArchiveWarnings? })`
  - `writeArchiveSnapshot({ cwd, stanPath, includes?, excludes?, anchors? })`
  - `prepareImports({ cwd, stanPath, map })` (stages `.stan/imports/<label>/...`)

- Imports inclusion policy (CLI-owned):
  - `stan init` gitignores `<stanPath>/imports/` by default.
  - The CLI implicitly includes `<stanPath>/imports/**` in:
    - snapshot baselines (`stan init`, `stan snap`), and
    - archives (`stan run` full + diff), so that changes to staged imports appear in `archive.diff.tar` without requiring users to add includes in config.

- Prompt helpers:
  - `getPackagedSystemPromptPath()`
  - `assembleSystemMonolith(cwd, stanPath)` (dev workflows only; quiet).

- Patch:
  - `detectAndCleanPatch`, `applyPatchPipeline`, `parseFileOpsBlock`, `executeFileOps`.

- Validation:
  - `validateResponseMessage`, `validateOrThrow`.

All core APIs are deterministic and presentation‑free; the CLI owns UX.

---

## 12) Documentation and versioning

- CLI help and docs must reflect:
  - Prompt resolution and plan line.
  - PATH augmentation and child env semantics.
  - Facet overlay strategy (tie‑breaker and scoped re‑inclusion).
  - Vitest Option 1 testing model.
- Semantic versioning; changelog calls out meaningful functional changes.
