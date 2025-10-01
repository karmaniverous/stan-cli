---
title: Archives & Snapshots
---

# Archives & snapshots

## Artifacts

- `<stanPath>/output/archive.tar` — full snapshot of repo files (excludes binaries).
- `<stanPath>/output/archive.diff.tar` — changed files vs snapshot (always when archiving; binaries are also screened out).
- `*.txt` outputs — deterministic stdout/stderr from scripts.

Attach `archive.tar` (and `archive.diff.tar` if present) to your chat.

## Selection semantics (includes/excludes)

STAN selects files for archiving in two passes:

- Base selection
  - Both regular and diff archives apply the same screening, including exclusion of binary files.
  - A concise “archive warnings” summary (binary exclusions, large text call‑outs) is printed to the console.

  - Applies your `.gitignore`, default denials (`node_modules`, `.git`),
    user `excludes`, and STAN workspace rules. Explicit `excludes` take precedence
    over any later `includes`.
  - Reserved exclusions always apply:
    - `<stanPath>/diff` is always excluded.
    - `<stanPath>/output` is excluded unless you enable combine mode.

- Additive includes
  - `includes` is an allow‑list that ADDS matches back even if they would be
    excluded by `.gitignore` or default denials.
  - Explicit `excludes` still win: if a path matches both `includes` and `excludes`,
    it is excluded.
  - Reserved exclusions still apply (see above).

Example (YAML):

```yaml
excludes:
  - '**/.tsbuild/**'
  - '**/generated/**'
includes:
  - '**/*.md' # bring docs back even if ignored elsewhere
```

## Combine mode

Include outputs inside archives and remove them from disk:

```
stan run -c
```

Regular archive includes `<stanPath>/output` (excluding the archive files themselves).
Diff archive excludes `<stanPath>/diff` and both archive files.

## Snapshot policy

`stan snap` writes `<stanPath>/diff/.archive.snapshot.json` and maintains an
undo/redo history under `<stanPath>/diff`:

```
stan snap
stan snap info | undo | redo | set <index>
stan snap -s    # stash before snap; pop after
```

Snapshots are used to compute archive diffs; `stan run` creates a diff archive even
when nothing changed (a sentinel is written in that case).

## Preflight

At the start of `stan run`, `stan snap`, and `stan patch`, STAN:

- compares your local system prompt to the packaged baseline and warns about drift,
- nudges to run `stan init` after upgrades if the docs baseline changed,
- prints concise guidance (TTY-aware).
