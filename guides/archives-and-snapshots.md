---
title: Archives & Snapshots
---

# Archives & snapshots

Related guides:
- [Stan Configuration](./configuration.md)
- [CLI Usage & Examples](./cli-examples.md)

## Artifacts

- `<stanPath>/output/archive.tar` — full snapshot of repo files (excludes binaries).
- `<stanPath>/output/archive.diff.tar` — changed files vs snapshot (always when archiving; binaries are also screened out).
- `*.txt` outputs — deterministic stdout/stderr from scripts.

Attach `archive.tar` (and `archive.diff.tar` if present) to your chat.

## Selection semantics (includes/excludes)

STAN selects files for archiving in two passes:

- Base selection
  - Both regular and diff archives apply the same screening, including exclusion of binary files.
  - Classification is performed by the engine (binary exclusions, large‑text call‑outs). The CLI may surface a concise summary when enabled; by default no additional warnings file is written and archives are created silently.
  - Applies your `.gitignore`, default denials (`node_modules`, `.git`), `stan-core.excludes`, and STAN workspace rules. Explicit `excludes` take precedence over any later `includes`. Reserved exclusions always apply:
    - `<stanPath>/diff` is always excluded.
    - `<stanPath>/output` is excluded unless you enable combine mode.

- Additive includes
  - `stan-core.includes` is an allow‑list that ADDS matches back even if they would be excluded by `.gitignore` or default denials.
  - Explicit `excludes` still win: if a path matches both `includes` and `excludes`, it is excluded.
  - Reserved exclusions still apply (see above).

Example (YAML):

```yaml
excludes:
  - '**/.tsbuild/**'
  - '**/generated/**'
includes:
  - '**/*.md' # bring docs back even if ignored elsewhere
```

### Anchors and diff archives (changed-only)

- Both full and diff archives honor `anchors` (subject to reserved denials enforced by the engine).
- The diff archive remains “changed-only”: anchored files appear in `archive.diff.tar` only when they have changed since the active snapshot baseline.
- If you introduce a new anchored file that was not present in the snapshot baseline yet, it may appear once as “added” in the next diff (acceptable).
- This is important for gitignored-but-important state such as `<stanPath>/system/facet.state.json` and `<stanPath>/system/.docs.meta.json`.

### Imports staging

- At the start of `stan run`, the CLI clears `<stanPath>/imports/` and then stages imports for the current configuration. This ensures that removing an import label from `stan.config.*` also removes any previously staged files for that label on the next run.
- The engine’s `prepareImports` still clears per‑label directories for robustness and for non‑CLI consumers; the CLI’s global clear is an additional safety to remove labels that are no longer configured.

## Combine mode

Include outputs inside archives and remove them from disk:

```
stan run -c
```

Regular archive includes `<stanPath>/output` (excluding the archive files themselves). Diff archive excludes `<stanPath>/diff` and both archive files.

### System prompt (diff vs full)

- The full archive always contains the system prompt used for the run at `<stanPath>/system/stan.system.md` (materialized temporarily when needed).
- Diffs suppress `stan.system.md` in steady state when the effective prompt is sourced from an ephemeral location (`--prompt core` or a custom path) and has not changed since the last `stan snap`.
- When the effective prompt changes (e.g., the packaged core prompt updates or your custom prompt path changes), the prompt is included exactly once in the next `archive.diff.tar` so downstream assistants can see the change.
- Local prompts (`--prompt local`) participate in diffs via normal snapshot rules.

## Snapshot policy

`stan snap` writes `<stanPath>/diff/.archive.snapshot.json` and maintains an undo/redo history under `<stanPath>/diff`:

```
stan snap
stan snap info | undo | redo | set <index>
stan snap -s # stash before snap; pop after
```

Snapshots are used to compute archive diffs; `stan run` creates a diff archive even when nothing changed (a sentinel is written in that case).

### Overlay-aware snapshots

- The baseline snapshot written by `stan snap` applies the same facet overlay view that `stan run` uses (includes, excludes, and anchors).
- This ensures overlay changes (e.g., activating a facet that was previously inactive, or deactivating one) are reflected accurately in the next `archive.diff.tar`.
- Concretely, inactive facets contribute subtree excludes to the snapshot, while anchors from facet meta are always kept to preserve breadcrumbs.

## Preflight

At the start of `stan run`, `stan snap`, and `stan patch`, STAN:

- compares your local system prompt to the packaged baseline and warns about drift,
- nudges to run `stan init` after upgrades if the docs baseline changed,
- prints concise guidance (TTY-aware).
