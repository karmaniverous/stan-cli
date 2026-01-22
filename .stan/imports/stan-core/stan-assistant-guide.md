# STAN assistant guide — stan-core (engine)

This guide is a compact, self-contained usage contract for `@karmaniverous/stan-core` (the STAN engine). It is written so a STAN assistant (or human) can integrate the engine correctly without needing to consult `.d.ts` files or other docs.

## What this package is

`@karmaniverous/stan-core` is the **engine** behind STAN:

- File selection (gitignore + includes/excludes + reserved workspace rules + anchors)
- Archiving (full `archive.tar` and diff `*.diff.tar`)
- Snapshotting (hash-based snapshot under `<stanPath>/diff`)
- Dependency graph mode (context expansion; optional; context mode only)
- Patch engine (git-apply cascade with jsdiff fallback + optional File Ops)
- Imports staging (copy external artifacts into `<stanPath>/imports/<label>/...`)
- Optional response-format validation utility

It is presentation-free: the engine does not own CLI/TTY behavior.

## Runtime requirements

- Node: `>= 20`
- Packaging: ESM-only (no CommonJS `require()` entrypoint)
- This repo’s default STAN workspace is `stanPath: .stan` (see config below).

## Configuration (stan.config.\*)

The engine reads a `stan.config.yml|yaml|json` and consumes only the **top-level** `stan-core` block:

- `stanPath: string` (required; non-empty)
- `includes?: string[]` (default `[]`)
- `excludes?: string[]` (default `[]`)
- `imports?: Record<string, string | string[]>` (normalized to arrays)

The engine ignores other top-level blocks (e.g., `stan-cli`).

YAML example:

```yaml
stan-core:
  stanPath: .stan
  includes: []
  excludes:
    - docs/**
  imports:
    peer-docs:
      - ../peer/.stan/system/stan.requirements.md
      - ../peer/.stan/system/stan.todo.md
```

## Workspace layout under `stanPath`

Given `stanPath = ".stan"`:

- `.stan/system/` — prompts/docs (not owned by the engine’s runtime features, but included in archives)
- `.stan/output/` — archive outputs (and optionally other outputs when “combine” behavior is used by a caller)
- `.stan/diff/` — snapshot state:
  - `.archive.snapshot.json`
  - `.stan_no_changes` sentinel when diff has no changes
  - `archive.prev.tar` (previous full archive copy)
- `.stan/patch/` — patch workspace (not intended for archiving; treated as reserved)
- `.stan/imports/` — staged imports (copy-in area for external artifacts)
- `.stan/context/` — dependency-graph artifacts and staged external context (context mode only):
  - `dependency.meta.json` (assistant-facing graph meta)
  - `dependency.state.json` (assistant-authored selection state)

## File selection model (mental model)

The engine uses **repo-relative POSIX paths** (forward slashes) for selection and outputs.

### Base denials / reserved workspace

These are always excluded from archives and cannot be forced back by includes/anchors:

- `.git/**`
- `<stanPath>/diff/**`
- `<stanPath>/patch/**`
- archive files under `<stanPath>/output` (e.g., `archive.tar`, `archive.diff.tar`)
- binary screening during archive classification (binaries are excluded even if selected)

Additionally:

- `.stan/imports/**` is staged context and should be treated as read-only:
  - never create, patch, or delete files under `.stan/imports/**`.
  - the engine also enforces this when `stanPath` is provided to mutation APIs (Patch + File Ops), refusing ops/patches that target `<stanPath>/imports/**`.

Additionally:

- `<stanPath>/output/**` is excluded from selection unless explicitly included by the calling mode (see `includeOutputDir` / `includeOutputDirInDiff`).

### Includes vs excludes vs anchors (precedence)

- `includes` are **additive**: they can add paths even if `.gitignore` would ignore them.
- `excludes` win over `includes`.
- `anchors` are a **high-precedence re-include channel**:
  - they are applied after excludes and `.gitignore`,
  - but they still cannot override reserved denials or output exclusion (when output is not being included).

### Monorepo sub-package default exclusion

By default, any nested directory that contains its own `package.json` (other than the repo root) is treated as a sub-package and excluded. You can re-include it via `includes` (e.g., `packages/app1/**`).

## Core APIs and working patterns

### Imports (optional staging step)

If you use `imports` in config (or any external map), stage them first so the staged copies are what get archived:

```ts
import { prepareImports } from '@karmaniverous/stan-core';

await prepareImports({
  cwd: process.cwd(),
  stanPath: '.stan',
  map: {
    'peer-docs': ['../peer/.stan/system/*.md'],
  },
});
```

Contract:

- Destination is `<stanPath>/imports/<label>/...`.
- Label is sanitized into a safe nested path (allows `@scope/pkg`-style segments; forbids `..`).
- Files are copied best-effort; the engine stays silent unless you pass `onStage(label, files)` callback.

### Full archive (binary-safe)

```ts
import { createArchive } from '@karmaniverous/stan-core';

const tarAbs = await createArchive(process.cwd(), '.stan', {
  includeOutputDir: false,
  // optional selection overrides:
  includes: [],
  excludes: ['docs/**'],
  anchors: ['README.md'], // re-include even if excluded (subject to reserved rules)
  onArchiveWarnings: (text) => {
    // surface “binaries excluded” / “large text flagged” to the caller
    console.log(text);
  },
});
```

Contract:

- Writes to `<stanPath>/output/<fileName>` (default `archive.tar`).
- If an existing archive is present, it is copied to `<stanPath>/diff/archive.prev.tar` before overwrite.
- Archive-time classifier:
  - excludes binaries from the tar,
  - flags large text files (included, but warned).
- The engine does not write warnings to disk; warnings are surfaced via callback (when provided).

### Diff archive + snapshot management

```ts
import { createArchiveDiff } from '@karmaniverous/stan-core';

const { diffPath } = await createArchiveDiff({
  cwd: process.cwd(),
  stanPath: '.stan',
  baseName: 'archive', // => archive.diff.tar
  updateSnapshot: 'createIfMissing', // 'never' | 'createIfMissing' | 'replace'
  includeOutputDirInDiff: false,
  excludes: ['docs/**'],
  anchors: ['docs/README.md'],
  onArchiveWarnings: (text) => console.log(text),
});
```

Contract:

- Snapshot path: `<stanPath>/diff/.archive.snapshot.json`.
- “No changes” case:
  - engine writes `<stanPath>/diff/.stan_no_changes`,
  - diff tar contains that sentinel file.
- When `includeOutputDirInDiff: true`, diff tar also includes `<stanPath>/output` directory tree (but still excludes the archive files and reserved dirs).

### Write/refresh snapshot directly

```ts
import { writeArchiveSnapshot } from '@karmaniverous/stan-core';

await writeArchiveSnapshot({
  cwd: process.cwd(),
  stanPath: '.stan',
  excludes: ['docs/**'],
  anchors: ['docs/README.md'],
});
```

## Dependency graph mode (context expansion)

When the CLI enables “context mode”, the engine can generate a dependency graph and use an assistant-authored state file to expand the archived context.

### Building and writing dependency meta (engine API)

The engine can build and persist the assistant-facing dependency meta file:

```ts
import {
  buildDependencyMeta,
  writeDependencyMetaFile,
} from '@karmaniverous/stan-core';

const cwd = process.cwd();
const stanPath = '.stan';

const built = await buildDependencyMeta({
  cwd,
  stanPath,
  selection: { includes: [], excludes: [], anchors: [] },
});

await writeDependencyMetaFile({ cwd, stanPath, meta: built.meta });
// writes: <stanPath>/context/dependency.meta.json
```

### Staging external dependency bytes (engine API)

The dependency graph contains external nodes (npm + abs/outside-root). To make those
files available to the assistant *inside archives*, they must be copied (“staged”)
into the repo under `<stanPath>/context/**` prior to archiving.

The engine provides:

```ts
import { stageDependencyContext } from '@karmaniverous/stan-core';

await stageDependencyContext({
  cwd,
  stanPath,
  meta: built.meta,
  sources: built.sources,
  clean: true, // clears <stanPath>/context/{npm,abs} before staging
});
```

Contract:
- Stages only `<stanPath>/context/npm/**` and `<stanPath>/context/abs/**` node IDs.
- Verifies sha256 (and size when present) against `meta.nodes[nodeId].metadata`.
- Fails fast (throws) on mismatch/missing source locator.
- No console I/O; returns `{ staged, skipped }` on success.

Important:
- `<stanPath>/context/**` is typically gitignored, so callers must ensure it is
  selected for archiving. The engine’s selection model supports this via `anchors`
  because anchors override both `.gitignore` and configured excludes:
  - `anchors: ['<stanPath>/context/**']` (use the concrete `stanPath`, e.g. `.stan/context/**`)

### Archive-flow helpers (stage + include + archive)

For adapters that want a single “do the right thing” entrypoint (typically stan-cli),
the engine also provides archive-flow wrappers that:
- compute the stage set from dependency state closure (when provided),
- stage only those external nodes,
- and force archive inclusion via `anchors: ['<stanPath>/context/**']`.

```ts
import {
  createArchiveWithDependencyContext,
  createArchiveDiffWithDependencyContext,
} from '@karmaniverous/stan-core';

const full = await createArchiveWithDependencyContext({
  cwd,
  stanPath,
  dependency: { meta: built.meta, state: depState, sources: built.sources, clean: true },
  archive: { includeOutputDir: false },
});

const diff = await createArchiveDiffWithDependencyContext({
  cwd,
  stanPath,
  dependency: { meta: built.meta, state: depState, sources: built.sources, clean: false },
  diff: { baseName: 'archive', updateSnapshot: 'createIfMissing' },
});
```

### Strict undo/redo validation seam (engine API)

Undo/redo must fail fast if the restored dependency selection cannot be satisfied
by the *current environment*.

The engine provides:

```ts
import { validateDependencySelection } from '@karmaniverous/stan-core';

const res = await validateDependencySelection({
  cwd,
  stanPath,
  meta,  // dependency.meta.json contents
  state, // dependency.state.json contents (raw)
});
if (!res.ok) {
  // res.mismatches contains per-node reasons (npm vs abs)
}
```

Contract (v1):
- Computes selected node IDs from meta+state closure (excludes win).
- Validates external nodes only:
  - npm nodes under `<stanPath>/context/npm/**` by locating `<pkgName>@<pkgVersion>`
    in the current install and hashing `<pathInPackage>`.
  - abs nodes under `<stanPath>/context/abs/**` by hashing `locatorAbs`.
- Returns deterministic, structured mismatches for adapters to surface.

Dependency requirements (loaded only when invoked):

- `buildDependencyMeta` dynamically imports `typescript` and throws if it cannot be imported.
- `buildDependencyMeta` dynamically imports `@karmaniverous/stan-context` and throws if it is not installed.
- This keeps non-context usage lean: these dependencies are not loaded unless the caller invokes context mode.

Artifacts (under `.stan/context/`):

- `dependency.meta.json` — assistant-facing graph meta:
  - deterministic `nodes` and `edges`,
  - per-node `metadata.hash` (sha256) and `metadata.size` (bytes) when applicable,
  - per-node `description` (when available from the context compiler),
  - `locatorAbs` only for abs/outside-root nodes (used for strict undo validation).
- `dependency.state.json` — assistant-authored selection state:
  - selects nodes to include and how deeply to traverse dependencies.
- staged external context (engine-staged for archiving):
  - `.stan/context/npm/<pkgName>/<pkgVersion>/<pathInPackage>`
  - `.stan/context/abs/<sha256(sourceAbs)>/<basename>`

Archive output:

- `archive.meta.tar` is written under `.stan/output/` when context mode is enabled.
  - It includes system files + dependency meta.
  - It excludes dependency state and staged payloads.
  - It excludes `.stan/system/.docs.meta.json`.

Note:

- Builtin (`node:*`) and missing/unresolved nodes are omitted from persisted `dependency.meta.json`; callers may surface them as warnings.

State file schema (v1):

```ts
type DependencyEdgeType = 'runtime' | 'type' | 'dynamic';

type DependencyStateEntry =
  | string
  | [string, number]
  | [string, number, DependencyEdgeType[]];

type DependencyStateFile = {
  include: DependencyStateEntry[];
  exclude?: DependencyStateEntry[]; // excludes win
};
```

Defaults:

- If `depth` is omitted, it defaults to `0` (include only that nodeId).
- If `edgeKinds` is omitted, it defaults to `['runtime', 'type', 'dynamic']`.

Selection semantics:

- Expansion traverses outgoing edges up to depth, restricted to edgeKinds.
- Excludes win and subtract using the same traversal semantics.
- In dependency mode, expansion is intended to expand beyond baseline selection:
  - overrides `.gitignore` and configured excludes,
  - but never overrides reserved workspace denials or binary exclusion.

### Meta archive (thread opener)

When context mode is enabled by a caller (typically stan-cli), the engine can create a small thread-opener archive at `.stan/output/archive.meta.tar`:

```ts
import { createMetaArchive } from '@karmaniverous/stan-core';

const p = await createMetaArchive(process.cwd(), '.stan');
// p === <abs>/.stan/output/archive.meta.tar
```

Contract:

- Includes `<stanPath>/system/**` excluding `<stanPath>/system/.docs.meta.json`.
- Includes `<stanPath>/context/dependency.meta.json`.
- Excludes dependency state and staged payloads under `<stanPath>/context/**` by omission.

### Patch application pipeline

Use this when you already have a unified diff text (string).

```ts
import {
  applyPatchPipeline,
  detectAndCleanPatch,
} from '@karmaniverous/stan-core';

const cwd = process.cwd();
const stanPath = '.stan';

const cleaned = detectAndCleanPatch(rawPatchText);

const out = await applyPatchPipeline({
  cwd,
  stanPath, // enables workspace-scoped safety rules (e.g., imports read-only)
  patchAbs: '/abs/path/to/.stan/patch/.patch', // caller chooses where it is stored
  cleaned,
  check: false, // true => sandbox write only
});

if (!out.ok) {
  // out.result.captures includes git attempt captures
  // out.js (when present) includes jsdiff failures
}
```

Contract:

- Pipeline order:
  1. `git apply` cascade (tolerant flags, p1 then p0 by default),
  2. jsdiff fallback (whitespace/EOL tolerant),
  3. final “creation fallback” for clearly-new files in malformed diffs.
- `check: true` writes patched content to a sandbox directory (no repo mutation).
- The engine does not print diagnostics; callers inspect the returned structured outcome.
- Imports safety:
  - `<stanPath>/imports/**` is protected staged context.
  - When you provide `stanPath`, the engine refuses to apply diffs that target `<stanPath>/imports/**`.

### File Ops (pre-ops)

File Ops are a lightweight, safe structural operations layer (run before unified diffs):

- `mkdirp <path>`
- `mv <src> <dest>`
- `rm <path>`
- `rmdir <path>` (empty dirs only)

```ts
import { executeFileOps, parseFileOpsBlock } from '@karmaniverous/stan-core';

const cwd = process.cwd();
const stanPath = '.stan';

const plan = parseFileOpsBlock(
  ['### File Ops', 'mkdirp src/new', 'mv src/old.ts src/new/old.ts'].join('\n'),
  stanPath,
);

if (plan.errors.length) throw new Error(plan.errors.join('\n'));

await executeFileOps(cwd, plan.ops, false, stanPath);
```

Contract:

- Only repo-relative POSIX paths are allowed (no absolute paths; no `..` traversal).
- `dryRun=true` validates without changing the filesystem.
- When you provide `stanPath`, the engine refuses File Ops that target `<stanPath>/imports/**` (protected staged context).

### Optional: response-format validation

```ts
import { validateResponseMessage } from '@karmaniverous/stan-core';

const res = validateResponseMessage(assistantReplyText);
if (!res.ok) throw new Error(res.errors.join('\n'));
```

This is intended for tooling that enforces a predictable assistant reply format.

## Prompt helper utilities (dev workflows)

- `getPackagedSystemPromptPath(): string | null`
  - Returns the packaged `dist/stan.system.md` path if present (else null).
- `assembleSystemMonolith(cwd, stanPath)`
  - Assembles `<stanPath>/system/parts/*.md` into `<stanPath>/system/stan.system.md`.
  - Quiet helper (no logs); callers decide what to print.

## Common pitfalls / invariants

- Always pass the correct `stanPath` (this repo uses `.stan`).
- Anchors can re-include files excluded by `.gitignore`/excludes, but they cannot override reserved denials and they cannot include `<stanPath>/output` unless output-inclusion mode is enabled.
- `onArchiveWarnings` is the intended integration point for archive classifier warnings; the engine remains silent by default.
- All file lists are POSIX repo-relative; normalize Windows paths before comparing.
