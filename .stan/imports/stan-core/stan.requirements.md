# STAN — Requirements (stan-core engine)

This document lists durable requirements for the STAN engine (“stan-core”), which provides programmatic services for configuration, file selection, archiving/diffing/snapshotting, patch application, imports staging, response validation, and prompt assembly. It is intentionally free of CLI/TTY concerns, which are owned by stan-cli.

---

## SSR-friendly dynamic import pattern (test stability)

- Motivation
  - Under Vitest 4 SSR, named-export bindings can be transiently unavailable during module evaluation. To keep tests stable without changing runtime behavior, modules that must resolve peer exports dynamically SHOULD use a named-or-default dynamic import pattern.
- Requirement
  - When a module must resolve a peer export at runtime in an SSR/testing context, prefer the named export and fall back to the default export’s property of the same name. Throw a clear error only if neither is present.
- Example (pattern)
  ```ts
  // Resolve "foo" from ./peer using a robust SSR-safe pattern.
  const getFoo = async (): Promise<typeof import('./peer')['foo']> => {
    const mod = await import('./peer');
    const named = (mod as { foo?: unknown }).foo;
    const viaDefault = (mod as { default?: { foo?: unknown } }).default?.foo;
    const fn = (typeof named === 'function' ? named : viaDefault) as
      | typeof import('./peer')['foo']
      | undefined;
    if (typeof fn === 'function') return fn;
    throw new Error('foo export not found in ./peer');
  };
  ```
- Guidance
  - Use this pattern only where dynamic resolution is required for test/SSR robustness; prefer normal static imports for production code paths whenever possible.
  - Do not introduce side effects or console I/O in the resolver; keep it pure and presentation-free.

## 0) Swappable Core (engine integration contract)

stan-cli MUST be able to run against any compatible stan-core at runtime.

- Loader expectations
  - stan-core exports a constant `CORE_VERSION: string`.
  - stan-core publishes a stable, documented API surface (see “Public API”).
  - stan-core provides prompt helpers required by the CLI:
    - `getPackagedSystemPromptPath(): string | null` resolves packaged `dist/stan.system.md`.
    - `assembleSystemMonolith(cwd, stanPath)` assembles `<stanPath>/system/parts/*.md` into `<stanPath>/system/stan.system.md` in dev workflows (quiet helper; no logs).

- Packaging
  - Dist: ESM/CJS outputs under `dist/mjs` and `dist/cjs` with `.d.ts` types.
  - No CLI binaries or TTY dependencies in the engine package.

---

## 1) stan-core — Requirements (engine)

### Purpose

Provide a cohesive, dependency‑light engine that implements the durable capabilities of STAN as pure TypeScript services. The engine is transport‑agnostic and swappable at runtime.

### Scope

- Configuration (namespaced; canonical)
  - Config files are namespaced by consumer at the top level. Canonical keys:
    - `stan-core`: engine‑owned object; REQUIRED by the engine.
    - `stan-cli`: CLI‑owned object; out of scope for the engine.
  - The engine MUST read and strictly validate only the `stan-core` block with the minimal schema:
    - `stanPath: string (non‑empty)`,
    - `includes?: string[]` (default `[]`),
    - `excludes?: string[]` (default `[]`),
    - `imports?: Record<string, string|string[]>` (normalized to arrays).
  - Unknown keys inside `stan-core` MAY be rejected (strict schema). Unknown keys outside `stan-core` are ignored by the engine.
  - Root‑level legacy shapes and vendor extensions (e.g., `x-stan-cli`) are not part of the canonical model. Transitional acceptance is permitted only insofar as needed to keep STAN functional while both packages release the namespaced change.
  - Expose typed loaders (sync/async) that:
    - resolve config path,
    - select the `stan-core` object (error when missing),
    - return the minimal `ContextConfig` shape.

- Filesystem selection
  - Enumerate repository files (POSIX‑normalized paths).
  - Apply selection rules:
    - default denials (`node_modules`, `.git`),
    - `.gitignore` semantics,
    - `includes` (additive, override `.gitignore`),
    - `excludes` (take precedence over `includes`),
    - `anchors` (high‑precedence re‑inclusion; see below),
    - reserved workspace rules (exclude `<stanPath>/diff` and `<stanPath>/patch`, conditionally exclude `<stanPath>/output`).
  - Anchors channel (new):
    - Core selection surfaces MUST accept an optional `anchors?: string[]` and re‑include matched paths after applying excludes and `.gitignore`.
    - Anchors MUST NOT override reserved denials (`.git/**`, `<stanPath>/diff/**`, `<stanPath>/patch/**`, and archive outputs) and MUST NOT bypass binary screening.
    - Surfaces:
      - `filterFiles(files, { …, includes?, excludes?, anchors? })`
      - `createArchive(cwd, stanPath, { …, includes?, excludes?, anchors? })`
      - `createArchiveDiff({ …, includes?, excludes?, anchors?, … })`
      - `writeArchiveSnapshot({ …, includes?, excludes?, anchors? })`
  - Precedence (documented behavior):
    - `includes` override `.gitignore` (not `excludes`);
    - `excludes` override `includes`;
    - `anchors` override both `excludes` and `.gitignore`, subject to reserved denials and binary screening.

- Archiving and diffs
  - Create full and diff archives:
    - `archive.tar` (full selection),
    - `archive.diff.tar` (changed since snapshot with snapshot management).
  - Classification at archive time:
    - Exclude binaries,
    - Flag large text by size and/or LOC.
  - Warnings must be exposed via return values and/or optional callbacks (no console I/O).
  - Overlay metadata (CLI):
    - The CLI MUST write a machine‑readable `overlay` block to `<stanPath>/system/.docs.meta.json` each run capturing: `enabled`, per‑run overrides (`activated`/`deactivated`), final `effective` facet map, any `autosuspended` facets (ramp‑up safety), and optional `anchorsKept`.
    - This metadata MUST be included in both full and diff archives so the assistant can distinguish selection/view changes from code churn across turns.

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
- No console output; diagnostics/warnings must flow back as data or via optional callbacks to the caller (CLI).
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
  - `writeArchiveSnapshot({ cwd, stanPath, includes, excludes, anchors? }): Promise<string>`
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

### Dependencies

- Allowed at runtime: `tar`, `fs-extra`.
- Not allowed: clipboard libraries, CLI frameworks, TTY/presentation utilities.

### Cross‑repo configuration alignment (CLI perspective)

- CLI MUST read and validate only the `stan-cli` top‑level object (strict schema).
- Legacy vendor extensions (e.g., `x-stan-cli`) and legacy root keys are not canonical; any temporary acceptance is for the shortest possible transition window to keep STAN functional.

### Patch ingestion — creation fallback (engine behavior)

Improve success on “new document” diffs commonly malformed in chat:

- Trigger
  - Only after the standard pipeline fails (git + jsdiff),
  - Only when confidently identified as a creation patch (`/dev/null → b/<path>` or equivalent “add only” hunks).
- Behavior
  1. Extract payload by stripping diff headers and removing leading “+” from payload lines.
  2. Normalize EOL to LF for the written file (no pre‑existing EOL to preserve).
  3. Ensure parent directories exist and create the file atomically.
- Guardrails
  - Never applies to edits of existing files.
  - Runs silently with a structured outcome; no console I/O.

### Testing

- Coverage for:
  - Config loaders and schema error messages (namespaced `stan-core` block).
  - Selection semantics (includes vs excludes precedence; reserved workspace exclusions; anchors re‑inclusion).
  - Archive classification (binary exclusion, large‑text flags) and warnings surfacing (returns/callback).
  - Diff archive + snapshot handling (changed/no‑changes sentinel).
  - Patch pipeline:
    - git apply attempt captures are structured and summarized,
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
