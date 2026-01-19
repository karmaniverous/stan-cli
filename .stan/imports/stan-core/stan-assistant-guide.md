# STAN assistant guide — stan-core (engine)

This guide is a compact, self-contained usage contract for `@karmaniverous/stan-core` (the STAN engine). It is written so a STAN assistant (or human) can integrate the engine correctly without needing to consult `.d.ts` files or other docs.

## What this package is

`@karmaniverous/stan-core` is the **engine** behind STAN:

- File selection (gitignore + includes/excludes + reserved workspace rules + anchors)
- Archiving (full `archive.tar` and diff `*.diff.tar`)
- Snapshotting (hash-based snapshot under `<stanPath>/diff`)
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

### Patch application pipeline

Use this when you already have a unified diff text (string).

```ts
import {
  applyPatchPipeline,
  detectAndCleanPatch,
} from '@karmaniverous/stan-core';

const cleaned = detectAndCleanPatch(rawPatchText);

const out = await applyPatchPipeline({
  cwd: process.cwd(),
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

### File Ops (pre-ops)

File Ops are a lightweight, safe structural operations layer (run before unified diffs):

- `mkdirp <path>`
- `mv <src> <dest>`
- `rm <path>`
- `rmdir <path>` (empty dirs only)

```ts
import { executeFileOps, parseFileOpsBlock } from '@karmaniverous/stan-core';

const plan = parseFileOpsBlock(
  ['### File Ops', 'mkdirp src/new', 'mv src/old.ts src/new/old.ts'].join('\n'),
);

if (plan.errors.length) throw new Error(plan.errors.join('\n'));

await executeFileOps(process.cwd(), plan.ops, false);
```

Contract:

- Only repo-relative POSIX paths are allowed (no absolute paths; no `..` traversal).
- `dryRun=true` validates without changing the filesystem.

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
