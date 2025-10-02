# STAN — Requirements (stan-core engine)

This document lists durable requirements for the STAN engine (“stan-core”), which provides programmatic services for configuration, file selection, archiving/diffing/snapshotting, patch application, imports staging, response validation, and prompt assembly. It is intentionally free of CLI/TTY concerns, which are owned by stan-cli.

---

## 0) Swappable Core (engine integration contract)

stan-cli MUST be able to run against any compatible stan-core at runtime.

- Loader expectations
  - stan-core exports a constant `CORE_VERSION: string`.
  - stan-core publishes a stable, documented API surface (see “Public API”).
  - stan-core provides prompt helpers required by the CLI:
    - `getPackagedSystemPromptPath(): string | null` resolves packaged `dist/stan.system.md`.
    - `assembleSystemMonolith(cwd, stanPath)` assembles `.stan/system/parts/*.md` into `.stan/system/stan.system.md` in dev workflows (quiet helper; no logs).

- Packaging
  - Dist: ESM/CJS outputs under `dist/mjs` and `dist/cjs` with `.d.ts` types.
  - No CLI binaries or TTY dependencies in the engine package.

---

## 1) stan-core — Requirements (engine)

### Purpose

Provide a cohesive, dependency‑light engine that implements the durable capabilities of STAN as pure TypeScript services. The engine is transport‑agnostic and swappable at runtime.

### Scope

- Configuration
  - Load, validate, and normalize `stan.config.*` (YAML/JSON) with a strict schema and friendly errors.
  - Expose typed loaders: sync and async.

- Filesystem selection
  - Enumerate repository files (POSIX‑normalized paths).
  - Apply selection rules:
    - default denials (`node_modules`, `.git`),
    - `.gitignore` semantics,
    - includes (additive, override `.gitignore`),
    - excludes (take precedence over includes),
    - reserved workspace rules (exclude `<stanPath>/diff` and `<stanPath>/patch`, conditionally exclude `<stanPath>/output`).

- Archiving and diffs
  - Create full and diff archives:
    - `archive.tar` (full selection),
    - `archive.diff.tar` (changed since snapshot with snapshot management).
  - Classification at archive time:
    - Exclude binaries,
    - Flag large text by size and/or LOC.
  - Warnings must be exposed via return values and/or optional callbacks (no console I/O).

- Snapshotting
  - Compute per‑file content hashes for the filtered selection.
  - Read/write the diff snapshot (`.archive.snapshot.json`) and manage the sentinel (`.stan_no_changes`) path when there are no changes.

- Patch engine
  - Accept patch input as a string.
  - Worktree‑first apply pipeline:
    - `git apply` cascade (p1→p0 variants with tolerant flags),
    - jsdiff fallback (whitespace/EOL tolerance, preserves original EOLs for edits),
    - structured outcome (attempt captures, per‑file failures).
  - File Ops pre‑ops:
    - `mv`, `rm`, `rmdir`, `mkdirp` with normalized, safe repo‑relative paths and a dry‑run mode.

- Imports staging
  - Stage external artifacts under `<stanPath>/imports/<label>/...`:
    - Resolve globs,
    - Preserve “tail” paths relative to glob‑parent,
    - Summarize staged files per label.

- Validation utilities (optional)
  - Response‑format validator for assistant replies:
    - One Patch per file,
    - Correct `diff --git` header count/order,
    - Commit Message last,
    - TODO cadence rule.

- Prompt helpers (engine‑side utilities)
  - `getPackagedSystemPromptPath` (dist monolith lookup).
  - `assembleSystemMonolith` (assemble parts → monolith; quiet, no logs).

### Non‑goals

- No CLI/TTY responsibilities (no Commander, no clipboard, no editor spawning).
- No console output; diagnostics/warnings must flow back as data or via optional callbacks.
- No long‑running interactive state (transport‑agnostic services only).

### Public API (representative; stable)

- Config
  - `loadConfig(cwd)`, `loadConfigSync(cwd)`
  - `resolveStanPath(cwd)`, `resolveStanPathSync(cwd)`
- Selection/FS
  - `listFiles(root)`, `filterFiles(files, opts)`
- Archive/diff/snapshot
  - `createArchive(cwd, stanPath, options): Promise<string>`
  - `createArchiveDiff(args): Promise<{ diffPath: string }>`
  - `writeArchiveSnapshot({ cwd, stanPath, includes, excludes }): Promise<string>`
  - Classification utility included as internal detail; warnings surfaced by archive APIs.
  - Optional callback: `onArchiveWarnings?: (text: string) => void` (where supported).
- Patch engine
  - `detectAndCleanPatch(raw: string): string`
  - `applyPatchPipeline({ cwd, patchAbs, cleaned, check, stripOrder? }) → { ok, result, js }`
  - `parseFileOpsBlock(body: string) → { ops, errors }`
  - `executeFileOps(cwd, ops, dryRun) → { ok, results }`
- Imports
  - `prepareImports({ cwd, stanPath, map }) → Promise<void>`
  - Optional callback: `onStage?: (label: string, files: string[]) => void` (where supported).
- Validation
  - `validateResponseMessage(text) → { ok, errors, warnings }`
- Prompt helpers
  - `getPackagedSystemPromptPath(): string | null`
  - `assembleSystemMonolith(cwd, stanPath) → Promise<{ target: string; action: 'written' | 'skipped-no-parts' | 'skipped-no-md' }>`
- Metadata
  - `CORE_VERSION: string`

Notes
- API must remain deterministic across runs for identical inputs.
- Paths are POSIX repo‑relative on input and output.

### Operational constraints

- Determinism: selection/archiving/snapshotting are deterministic for identical inputs.
- Path hygiene: external inputs/outputs use POSIX repo‑relative paths.
- Side‑effect bounds: changes are limited to documented workspace paths (e.g., `<stanPath>/output`, `<stanPath>/diff`, `<stanPath>/patch`).
- Dependencies:
  - Allowed at runtime: `tar`, `fs-extra`.
  - Not allowed: clipboard libraries, CLI frameworks, TTY/presentation utilities.

### Patch ingestion — creation fallback (engine behavior)

Improve success on “new document” diffs commonly malformed in chat:

- Trigger
  - Only after the standard pipeline fails (git + jsdiff),
  - Only when confidently identified as a creation patch (`/dev/null → b/<path>` or equivalent “add only” hunks).
- Behavior
  1) Extract payload by stripping diff headers and removing leading “+” from payload lines.
  2) Normalize EOL to LF for the written file (no pre‑existing EOL to preserve).
  3) Ensure parent directories exist and create the file atomically.
- Guardrails
  - Never applies to edits of existing files.
  - Runs silently with a structured outcome; no console I/O.

### Testing

- Coverage for:
  - Config loaders and schema error messages.
  - Selection semantics (includes vs excludes precedence; reserved workspace exclusions).
  - Archive classification (binary exclusion, large‑text flags) and warnings surfacing (returns/callback).
  - Diff archive + snapshot handling (changed/no‑changes sentinel).
  - Patch pipeline:
    - git cascade attempts summary shape,
    - jsdiff fallback on CRLF/LF variations,
    - creation fallback (simple, nested paths, sandbox/check).
  - File Ops parsing/execution (safety checks, dry‑run).
  - Prompt helpers (packaged path, assemble parts).
  - Response‑format validator (ordering, duplicate patches, commit position, TODO cadence).

### Documentation & versioning

- Semantic versioning for the engine package.
- API docs reflect only engine surfaces (no CLI guidance).
- Release notes highlight any behavior changes in selection, archiving, patch application, or validation.

### Cross‑repo coordination (engine perspective)

- Imports bridge (context only; read‑only under `.stan/imports/**`)
  - Typical label in stan-core: `cli-docs` → stage peer docs or threads as needed (narrow patterns).
  - Never write to `.stan/imports/**`; treat as read‑only context for archiving and dev‑plan decisions.

- Interop threads (lightweight, deterministic)
  - Outgoing messages: `.stan/interop/stan-cli/<UTC>-<slug>.md` (atomic Markdown).
  - Incoming messages are staged via imports; scan first, and prune outgoing notes once resolved (via File Ops).
