# STAN — Requirements (Split: stan-core and stan-cli)

This document contains durable project requirements for the STAN system, split into two coordinated packages:

- stan-core: the engine (pure services; no CLI or TTY/process concerns).
- stan-cli: the CLI and runner (ports/adapters that orchestrate stan-core).

Non‑requirements (assistant behavior, authoring policies, and process rules) belong in stan.project.md. This file defines scope, interfaces, and non‑functional constraints that should remain stable over time.

---

## 0) Swappable Core (entire engine, not just prompt)

The CLI MUST be able to run against any compatible stan-core at runtime.

- CLI option/env:
  - `--core <value>` (env: `STAN_CORE`) selects the core to load.
  - Resolution (deterministic):
    1) If omitted: use installed `@karmaniverous/stan-core`.
    2) If value starts with `dist:`: import `<path>/dist/mjs/index.js` (fallback to CJS if needed).
    3) If value starts with `src:`: register `tsx` under `<path>` and import `<path>/src/stan/index.ts`.
    4) Else (auto): if `<path>/dist/mjs/index.js` exists use dist; else if `<path>/src/stan/index.ts` exists use src via tsx; else error with actionable guidance.
- Capability/compatibility handshake:
  - stan-core MUST export `CORE_VERSION: string` and a stable API surface (see §1 “Public API”).
  - CLI prints a banner: `Using core: <package|path> (CORE_VERSION <x.y.z>) [dist|src]`.
  - CLI warns on major‐version mismatches.
- System prompt:
  - CLI must inject the monolith from the selected core into archives:
    - Prefer `getPackagedSystemPromptPath()` from core (dist/stan.system.md).
    - For a core source tree during dev, the CLI MAY assemble the monolith via `assembleSystemMonolith(cwd, stanPath)` before injection.

Rationale: this allows the installed CLI to drive a core under active development (including prompt iteration) without cross‑repo friction, while keeping core/CLI responsibilities cleanly separated.

---

## 1) stan-core — Requirements (engine)

### Purpose
Provide a cohesive, dependency‑light engine that implements the durable capabilities of STAN as pure services. stan-core must be usable without a TTY, without Commander/CLI, and without direct console output. The entire engine must be swappable at runtime by stan-cli (see §0).

### Scope
- Configuration
  - Load, validate, and normalize `stan.config.*` (YAML/JSON) using a strict schema with friendly errors.
  - Provide types inferred from the schema; expose synchronous and asynchronous loaders.

- Filesystem selection
  - Enumerate repository files (POSIX‑normalized).
  - Apply selection rules (default denials, .gitignore semantics, includes, excludes, reserved workspace rules).

- Archiving and diffs
  - Create `archive.tar` (full) and `archive.diff.tar` (changes vs snapshot).
  - Classify files at archive time: exclude binaries; flag large text.
  - Expose “warnings” to the caller via return value and/or optional callbacks (no direct logging).

- Snapshotting
  - Compute content hashes for the filtered selection.
  - Read/write the diff snapshot (`.archive.snapshot.json`).

- Patch engine
  - Accept patch input as a plain string (source is a CLI concern).
  - Worktree‑first apply pipeline:
    - `git apply` cascade (p1→p0, with tolerant variants),
    - jsdiff fallback (with whitespace/EOL tolerance),
    - structured outcome (attempt captures, per‑file failures).
  - File Ops (mv/rm/rmdir/mkdirp): declarative structural changes with safe normalization and a dry‑run mode.
  - Creation‑patch fast path (heuristic; see below).

- Imports staging
  - Stage labeled imports under `<stanPath>/imports/<label>/…` preserving tail subpaths.

- Validation utilities (optional exports)
  - Response‑format validator for assistant replies.

- System prompt helpers
  - `getPackagedSystemPromptPath()` — resolve packaged `dist/stan.system.md`.
  - `assembleSystemMonolith(cwd, stanPath)` — assemble `.stan/system/parts/*.md` into `.stan/system/stan.system.md` (dev‑only helper; no logging).

### Non‑goals
- No UI concerns (TTY progress, key handling, cancellation orchestration).
- No clipboard, editor spawning, or inquirer/Commander parsing.
- No console logging; return values and/or optional callbacks instead.

### Public API (representative; stable for swappable core)
- Config:
  - `loadConfig(cwd)`, `loadConfigSync(cwd)`, `resolveStanPath(cwd)`, `resolveStanPathSync(cwd)`
- Selection/FS:
  - `listFiles(root)`, `filterFiles(files, opts)`
- Archive/diff/snapshot:
  - `createArchive(cwd, stanPath, options) → { archivePath: string, warnings?: string }`
  - `createArchiveDiff(args) → { diffPath: string, warnings?: string }`
  - `writeArchiveSnapshot({ cwd, stanPath, includes, excludes }) → string`
  - Optional callbacks: `onArchiveWarnings?: (text: string) => void`
- Patch:
  - `detectAndCleanPatch(raw: string) → string`
  - `applyPatchPipeline({ cwd, patchAbs, cleaned, check, stripOrder? }) → { ok, result, js }`
  - `executeFileOps(cwd, ops, dryRun) → { ok, results }`
  - `parseFileOpsBlock(body: string) → { ops, errors }`
- Imports:
  - `prepareImports({ cwd, stanPath, map, onStage? }) → { summaries?: Array<{label:string, files:string[]}> }`
- Validation:
  - `validateResponseMessage(text) → { ok, errors, warnings }`
- Metadata:
  - `CORE_VERSION: string`
- Prompt helpers:
  - `getPackagedSystemPromptPath(): string | null`
  - `assembleSystemMonolith(cwd, stanPath): Promise<{ target: string; action: 'written' | 'skipped-no-parts' | 'skipped-no-md' }>` (quiet; no logs)

### Operational constraints
- Determinism: selection/archiving/snapshotting must be deterministic for identical inputs.
- Path hygiene: APIs accept/return POSIX repo‑relative paths.
- No side‑effects outside documented filesystem paths (stanPath workspace).
- Performance: scale to large repos; prefer streaming where practical.
- Dependency policy:
  - `tar` and `fs-extra` are allowed runtime dependencies.
  - No `clipboardy`, Commander, inquirer, chalk, or TTY/presentation deps.
- Output policy:
  - No console I/O. Expose diagnostics/warnings via return values and/or optional callbacks only.

### Patch ingestion — creation fallback
To improve success on “new document” patches (especially Markdown/docs) that may be malformed in chat:

- When the unified‑diff path fails, and the patch is identified as a new‑file creation (`/dev/null → b/<path>` or equivalent “add only” hunks), attempt a creation fallback:
  1. Extract hunk content by removing diff headers and leading “+” from payload lines.
  2. Normalize line endings to LF.
  3. Ensure parent directories exist; create the file.
- The fallback MUST run only after the standard pipeline fails and only for confident “new file” cases. It MUST NOT run for edits of existing files.

### Testing
- Maintain unit tests for all exported functions.
- Harden for Windows CI (no TTY/process dependencies).
- Include tests for:
  - Creation fallback (valid/invalid diffs, nested paths, sandbox mode).
  - Selection rules, includes vs excludes, reserved workspace exclusions.
  - Archive classification (binary/large) and warnings exposure via return/callback.

---

## 2) stan-cli — Requirements (CLI and runner)

### Purpose
Provide the user‑facing CLI (Commander adapters) and runner/TTY experience (live table rendering, cancellation keys, status lines), delegating all engine work to stan-core. The CLI is the owner of input acquisition (args/files/clipboard), presentation (status/logging), and editor/UX conveniences.

### Scope
- Subcommands: `run`, `patch`, `snap`, `init`, and `-v` (version banner).
- Runner orchestration:
  - Live (TTY) progress, logger mode parity (non‑TTY).
  - Cancellation (key/SIGINT) with late‑cancel guards before archive.
- CLI composition with stan-core:
  - Resolve config + defaults (flags > `cliDefaults` > built‑ins).
  - Map selection/archiving flags into stan-core APIs.
  - Present archive warnings (from core) exactly once per phase.
- “Patch” adapter:
  - Acquire patch source (argument/file/clipboard). The CLI MUST pass a string to the engine (core must not depend on clipboard).
  - Save cleaned patch to `<stanPath>/patch/.patch` (for git apply path); wire `applyPatchPipeline` and print unified diagnostics envelopes on failure.
  - Open modified files via configured editor (best‑effort).
- “Snap” adapter:
  - Delegate snapshot write; print concise results; optional stash/pop semantics.
- “Init” adapter:
  - Prompt or force-write config; ensure workspace folders; seed docs metadata.

### Swappable core (entire engine)
- Implement `--core` loader (see §0).
- After load, CLI prints banner: selected core, version, and prompt injection source.
- CLI injects the selected core’s monolith into downstream archives.

### Interop threads (multi‑file, no front matter)
- The CLI MUST scan for incoming interop messages staged via imports (see §3).
- When a local change implies peer action (e.g., engine/CLI responsibilities), the CLI SHOULD propose or write an outgoing interop message file under the correct local directory (see §3), keeping content short/actionable and pruning aggressively when resolved.

### Non‑goals
- Implementing patch/application logic (engine concern).
- Implementing selection/archiving mechanics internally (use stan-core).

### Operational constraints
- TTY awareness: live on TTY; logger mode elsewhere.
- BORING mode: colorless parity.
- Editor/clipboard actions are best‑effort and gated in tests.

### Testing
- Integration tests:
  - Flags → behavior mapping, plan printing, conflicts.
  - Live vs logger parity on artifacts.
  - Cancellation: guarantee no archives on cancel; appropriate exit codes.
- Adapters:
  - Patch diagnostics envelope printing.
  - `--core` loader behavior and banner.
  - Interop message creation/pruning via File Ops.

---

## 3) Cross‑repo coordination

### Imports bridge (stable)
- Each repo SHOULD stage the other repo’s high‑signal artifacts under `<stanPath>/imports/<label>/…` so both loops have the right context during chat:
  - Labels (suggested):
    - In stan-core: `cli-docs`, `cli-interop`
    - In stan-cli: `core-docs`, `core-types`, `core-interop`
  - Examples:
    - stan-cli:
      - `core-docs`: `../stan-core/.stan/system/stan.requirements.md`, `../stan-core/.stan/system/stan.todo.md`
      - `core-types`: `../stan-core/dist/index.d.ts`
      - `core-interop`: `../stan-core/.stan/interop/stan-cli/*.md`
    - stan-core:
      - `cli-docs`: `../stan-cli/.stan/system/stan.requirements.md`, `../stan-cli/.stan/system/stan.todo.md`
      - `cli-interop`: `../stan-cli/.stan/interop/stan-core/*.md`
- `prepareImports` must be invoked before archiving.

### Interop threads (multi‑file; no front matter; aggressive pruning)
- Purpose
  - Use small, self‑contained message files to coordinate cross‑repo actions (CLI ↔ Core) with deterministic ordering and minimal diffs.

- Locations
  - Outgoing (authored locally): `.stan/interop/<label>/*.md`
    - `<label>` is the agreed import label the peer uses to stage your messages (operational slug).
  - Incoming (staged via imports): `.stan/imports/<label>/*.md`
    - `<label>` is the import label defined in your config for the peer’s interop directory.

- Filename convention (no front matter)
  - `<UTC>-<slug>.md`
    - `<UTC>`: `YYYYMMDD-HHMMSSZ` (UTC, lexicographic chronological order)
    - `<slug>`: short, url‑safe, lower‑case (e.g., `api-surface`, `clipboard-boundary`, `swappable-core`)
  - Body: plain Markdown (first line “# Subject” optional), then bullets with what/why/actions/links.

- Assistant obligations
  - Always scan incoming interop messages (sorted by filename) before proposing cross‑repo work.
  - When a change here implies peer work, propose creating a new outgoing interop file under `.stan/interop/<label>/` using the naming convention and a concise body.
  - Append‑only: never rewrite prior messages; new info = new file.
  - Pruning: as soon as a message is resolved and its conclusions are ingested into local requirements/dev plan, propose File Ops to remove the message file(s). No rotation — keep interop threads short and ephemeral.

- Determinism
  - Ordering derives solely from filenames; no additional front matter is required.
  - Where helpful, include links or commit SHAs inside the body as free text (not schema).

Rationale: multi‑file interop yields small diffs, naturally ordered conversations, and trivial housekeeping via File Ops, while avoiding brittleness of long append‑only journals.

---
