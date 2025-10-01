# STAN — Requirements (Split: stan-core and stan-cli)

This document contains durable project requirements for the STAN system, split into two coordinated packages:

- stan-core: the engine (pure services; no CLI or TTY/process concerns).
- stan-cli: the CLI and runner (ports/adapters that orchestrate stan-core).

Non‑requirements (assistant behavior, authoring policies, and process rules) belong in stan.project.md. This file defines scope, interfaces, and non‑functional constraints that should remain stable over time.

---

## 1) stan-core — Requirements (engine)

### Purpose

Provide a cohesive, dependency‑light engine that implements the durable capabilities of STAN as pure services. stan-core must be usable without a TTY, without Commander/CLI, and without direct console output.

### Scope

- Configuration
  - Load, validate, and normalize stan.config.\* (YAML/JSON) using a strict schema with friendly errors.
  - Provide types inferred from the schema; expose synchronous and asynchronous loaders.
- Filesystem selection
  - Enumerate repository files (POSIX‑normalized).
  - Apply selection rules (default denials, .gitignore semantics, includes, excludes, reserved workspace rules).
- Archiving and diffs
  - Create archive.tar (full) and archive.diff.tar (changes vs snapshot).
  - Classify files at archive time: exclude binaries; flag large text; provide a warnings body to the caller (no direct I/O).
  - Provide a deterministic, testable interface for archive creation/filtering.
- Snapshotting
  - Compute content hashes for the filtered selection.
  - Read/write the diff snapshot (.archive.snapshot.json).
  - Provide bounded snapshot history helpers (state shape and manipulations) as pure data operations (no direct logging).
- Patch engine
  - Detect/clean incoming patch text (unified diff pores).
  - Worktree‑first apply pipeline:
    - git apply cascade (p1→p0 variants),
    - jsdiff fallback,
    - structured outcome (attempts, per‑file failures).
  - File Ops (mv/cp/rm/rmdir/mkdirp): declarative structural changes with safe normalization and a dry‑run mode.
  - Creation‑patch fast path (heuristic; see “Patch ingestion — creation fallback”).
- Imports staging
  - Stage labeled imports (globbed external files) under <stanPath>/imports.
  - Preserve tail subpaths relative to glob parent.
- Validation utilities (optional exports)
  - Response‑format validator for assistant replies.

### Non‑goals

- No UI concerns (TTY progress, key handling, cancellation orchestration).
- No clipboard, editor spawning, or Commander/CLI parsing.
- No console logging; return values must carry any warnings or diagnostics.

### Public API (representative)

- Config:
  - loadConfig(cwd): Promise<ContextConfig>
  - loadConfigSync(cwd): ContextConfig
- Selection:
  - listFiles(root): Promise<string[]>
  - filterFiles(files, opts): Promise<string[]>
- Archive/diff/snapshot:
  - createArchive(cwd, stanPath, options): Promise<string>
  - createArchiveDiff(options): Promise<{ diffPath: string }>
  - writeArchiveSnapshot({ cwd, stanPath, includes, excludes }): Promise<string>
  - classifyForArchive(cwd, relPaths): Promise<{ textFiles; excludedBinaries; largeText; warningsBody }>
- Patch:
  - detectAndCleanPatch(raw): string
  - applyPatchPipeline({ cwd, patchAbs, cleaned, check }): Promise<{ ok; result; js }>
  - executeFileOps(cwd, ops, dryRun): Promise<{ ok; results }>
- Imports:
  - prepareImports({ cwd, stanPath, map }): Promise<void>
- Optional:
  - validateResponseMessage(text): { ok; errors; warnings }

### Operational constraints

- Determinism: archiving, selection, and snapshotting must be deterministic for the same inputs.
- Path hygiene: all APIs accept/return POSIX‑normalized repo‑relative paths.
- No side‑effects outside the documented filesystem paths (stanPath workspace).
- Performance: selection/archiving should scale to large repos with streaming where practical (within the current tar interface).
- Dependency policy:
  - tar and fs-extra are allowed runtime dependencies.
  - No Commander, inquirer, clipboardy, or log-update (CLI‑only).
- Return‑values over logging:
  - logArchiveWarnings returns a string; callers decide whether/how to print.
  - Snapshot/history helpers return structures or lines; callers print.

### Patch ingestion — creation fallback (new requirement)

To improve success on “new document” patches (especially Markdown/docs) that are often malformed when provided through chat:

- If the unified‑diff path fails and the patch is detected as a creation patch (i.e., headers reference /dev/null → b/<path> or equivalent “add only” hunks), perform a creation fallback:
  1. Attempt to extract hunk content by stripping diff headers and removing leading “+” from each payload line; ignore leading “+++ b/<path>” and line‑metadata headers.
  2. Normalize line endings to LF (preserve CRLF on write only if an existing file was present; not applicable when creating).
  3. Create the file (ensure parent directory exists) with the decoded body.
- This fallback is applied only when the standard apply pipeline fails and the patch is confidently identified as a new‑file creation. It MUST not run for edits of existing files.
- The fallback MUST be implemented in stan-core (patch engine), not in CLI.

### Testing

- Maintain and run unit tests for all exported functions.
- Hardening for Windows CI: no TTY/process dependencies; tests should not assume key handling or live rendering.
- Include tests for:
  - Creation fallback (valid/invalid diffs, nested paths, sandbox mode).
  - Selection rules, includes vs excludes precedence, reserved path exclusions.
  - Archive classification (binary/large) and warnings body generation.

### Documentation & versioning

- Semantic versioning for the package.
- API‑level docs for public exports; clarity on return shapes (no console I/O).
- Release notes must call out any archive/patch behavior changes.

---

## 2) stan-cli — Requirements (CLI and runner)

### Purpose

Provide the user‑facing CLI (commander subcommands) and runner/TTY experience (live table rendering, cancellation keys, status lines), delegating all engine work to stan-core.

### Scope

- Subcommands: run, patch, snap, init (+ version printing).
- Runner orchestration:
  - Live (TTY) progress, logger (non‑TTY) parity, pre/post run plan display.
  - Cancellation via “q” and SIGINT parity; ensure archives are skipped on cancellation. Late‑cancel guard before archiving.
- CLI composition with stan-core:
  - Resolve config and defaults (flags > cliDefaults > built‑ins).
  - Map selection flags into stan-core selection/archiving APIs.
  - Present archive warnings from stan-core (no warnings files).
- “Patch” adapter:
  - Resolve source (clipboard/file/argument).
  - Persist raw patch to <stanPath>/patch/.patch.
  - Delegate to stan-core pipeline and print the unified diagnostics envelope.
  - Open modified files via configured editor (best‑effort; detached).
- “Snap” adapter:
  - Resolve context, optionally stash/pop; delegate snapshot write and history capture; print concise results.
- “Init” adapter:
  - Prompt for config (or force mode); write stan.config with schema‑ready structure; ensure docs metadata and .gitignore entries.

### Non‑goals

- Implementing patch/application logic (belongs in stan-core).
- Performing selection/archiving mechanics internally (use stan-core).

### Operational constraints

- TTY awareness: live rendering only on TTY; otherwise logger mode.
- BORING mode: colorless, bracketed tokens universally available.
- Preflight:
  - Detect packaged prompt drift and docs version change; print nudges.
  - Do not block execution on preflight failures.
- Editor/clipboard actions are best‑effort and gated in tests.

### Cross‑package behavior

- The CLI prints archive warnings received from stan-core once per phase.
- The CLI may inject packaged stan.system.md into the repo during the full archive phase for downstream repos and restore afterward.

### Testing

- Integration tests:
  - Flags → behavior mapping, plan printing, conflict combinations.
  - Live vs logger parity on artifacts.
  - Cancellation path: skip archives; non‑zero exit on cancel.
- Adapters:
  - Patch diagnostics envelope printing, help footer defaults, stash semantics.

### Documentation

- CLI usage, examples, and help footers must remain accurate.
- Release notes must call out runner UX changes (labels, parity, defaults).

---

## 3) Cross‑repo coordination (requirements impacting both)

- Recommendation policy:
  - When working in one repo, proactively recommend changes to the other whenever the desired outcome depends on engine vs adapter concerns.
  - Examples:
    - Engine changes (patch formats, selection semantics, imports staging) → open issues/PRs in stan-core.
    - CLI/runner UX (keys, labels, parity, help) → open issues/PRs in stan-cli.
- Imports bridge:
  - Each repo SHOULD stage the other’s high‑signal docs as imports under <stanPath>/imports/<label>/… so both loops have easy access during chat.
  - Labels:
    - In stan-core: label “cli-docs” to stage stan-cli docs.
    - In stan-cli: label “core-docs” to stage stan-core docs.
