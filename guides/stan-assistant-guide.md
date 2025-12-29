---
title: STAN assistant guide (stan-cli)
---

# STAN assistant guide — stan-cli

This guide is a compact, self-contained usage contract for `@karmaniverous/stan-cli` (the CLI + runner). It is written so a STAN assistant can use and integrate the package correctly without consulting `.d.ts` files or other repo documentation.

Related guides:
- [Bootloader & Assistant Setup](./bootloader.md)
- [Stan Configuration](./configuration.md)
- [CLI Usage & Examples](./cli-examples.md)
- [Archives & Snapshots](./archives-and-snapshots.md)

## What this package is (mental model)

`@karmaniverous/stan-cli` is the **CLI adapter layer** for STAN. It orchestrates a repeatable loop:

- **run**: execute scripts → capture deterministic text outputs → (optionally) archive the repo context (full + diff)
- **snap**: refresh the diff snapshot baseline and maintain a bounded snapshot history
- **patch**: apply (or validate) a unified diff (and optional File Ops), with diagnostics on failure

This package delegates “engine” responsibilities (file selection, archiving, diffing, patch pipeline internals) to `@karmaniverous/stan-core`.

Definitions (local):
- **TTY**: terminal mode where stdin/stdout are interactive (enables live UI + keypress capture).
- **LLM**: large language model (the assistant you are talking to).
- **Facet overlay**: a CLI-owned “view” that reduces archive size by excluding inactive subtrees while keeping breadcrumb “anchors”.

## Configuration (stan.config.*)

STAN resolves the nearest `stan.config.yml|yaml|json` by walking upward from `cwd`. The directory containing that config is treated as the effective repo root for the command.

### Current (recommended) namespaced config

`stan-cli` reads its own settings from top-level `stan-cli` and relies on the engine block `stan-core` for selection + `stanPath`:

```yaml
stan-core:
  stanPath: .stan
  includes: []
  excludes: []
  imports: {}

stan-cli:
  scripts:
    test: npm run test -- --no-color
    lint:
      script: npm run lint:fix
      warnPattern: \d+:\d+\s+warning
    build: npm run build
  cliDefaults:
    debug: false
    boring: false
    run:
      archive: true
      combine: false
      keep: false
      sequential: false
      plan: true
      live: true
      hangWarn: 120
      hangKill: 300
      hangKillGrace: 10
      # default script selection when -s is omitted:
      # true => all scripts, false => none, ["lint","test"] => only these keys
      scripts: true
      # prompt source used for archiving (see Prompt section below)
      prompt: auto
      # facet overlay default for this run (see Facets section)
      facets: false
    snap:
      stash: false
    patch:
      file: .stan/patch/last.patch
  patchOpenCommand: code -g {file}
  maxUndos: 10
  devMode: false
```

### Transitional legacy acceptance

Some code paths can temporarily accept legacy (pre-namespaced) config keys, but only when `STAN_ACCEPT_LEGACY=1`. Prefer migrating with:

```bash
stan init
```

## CLI contracts (what each command guarantees)

### `stan init`

- Creates or migrates `stan.config.*` to the namespaced layout.
- Writes a `.bak` next to the config when migrating.
- Ensures `.gitignore` includes standard `<stanPath>` subpaths and gitignores ephemeral state/metadata files.
- Ensures STAN workspace directories exist and writes `.stan/system/.docs.meta.json` (docs metadata).

### `stan run`

Produces deterministic outputs and (when enabled) archives:

- Script outputs: `<stanPath>/output/<key>.txt` (combined stdout/stderr).
- Full archive: `<stanPath>/output/archive.tar` (repo snapshot).
- Diff archive: `<stanPath>/output/archive.diff.tar` (changed-only vs snapshot baseline).

Live UI + cancellation:
- In TTY, live mode shows a progress table. Keys:
  - `q` cancels the run (best-effort skips archives; exit code set).
  - `r` restarts the run session (TTY only).

Combine mode:
- If `combine=true`, outputs are included inside archives and removed from disk afterward (archives remain).

### `stan snap`

- Refreshes the snapshot baseline used by diff archives.
- Maintains bounded history under `<stanPath>/diff/`:
  - `.snap.state.json` (stack + pointer),
  - `snapshots/` and (optionally) captured `archives/`.
- Optional `--stash`: `git stash -u` before snapshot and `stash pop` after.

### `stan patch`

Inputs (precedence):
1. `[input]` argument text
2. `-f/--file [filename]` (or configured default `stan-cli.cliDefaults.patch.file` unless `-F/--no-file`)
3. Clipboard

Behavior:
- Persists the raw patch payload to `<stanPath>/patch/.patch` (auditable).
- Applies either:
  - **File Ops only**, or
  - **Unified diff only** (hard rule: single-file diff).
- On failure: writes a compact diagnostics envelope and copies it to clipboard best-effort.
- On success (non-`--check`): may open the touched file in the editor using `patchOpenCommand` (`{file}` placeholder is repo-relative).

## Programmatic API (public exports)

This package’s stable programmatic exports are intentionally small. The CLI binary is the primary interface.

### `runSelected(...)`

Import:

```ts
import { runSelected } from '@karmaniverous/stan-cli';
```

Signature (contract-level):
- `runSelected(cwd, config, selection, mode, behavior, promptChoice?) => Promise<string[]>`

Where:
- `cwd: string` is the repo root to operate in.
- `config` is a `RunnerConfig`:
  - `stanPath: string` (workspace dir name, e.g. `.stan`)
  - `scripts: Record<string, string | { script: string; warnPattern?: string; warnPatternFlags?: string }>`
  - optional selection inputs forwarded into archiving when `behavior.archive=true`:
    - `includes?: string[]`, `excludes?: string[]`, `anchors?: string[]`, `imports?: Record<string, string[]>`
  - optional `overlayPlan?: string[]` (extra plan lines; presentation-only)
- `selection`:
  - `null` means “run all configured scripts”
  - `string[]` runs exactly those keys (caller should filter to known keys if desired)
- `mode: 'concurrent' | 'sequential'`
- `behavior`:
  - `archive?: boolean` (when true, create full + diff archives)
  - `combine?: boolean` (include outputs inside archives; remove outputs from disk)
  - `keep?: boolean` (do not clear output dir before running)
  - `live?: boolean` (TTY live UI; default behavior is “enabled when TTY”)
  - `plan?: boolean` (print plan first; false suppresses plan printing)
  - hang controls (TTY-only): `hangWarn`, `hangKill`, `hangKillGrace`
- `promptChoice?: string` controls which system prompt is used for archiving (see below).

Notes / invariants:
- `combine` implies archives conceptually; if you call `runSelected` directly, enforce `archive=true` yourself to avoid “combine with no archives” inconsistencies.
- The return value is the list of created artifact paths (outputs and archives) as absolute paths.

### `renderAvailableScriptsHelp(cwd)`

Import:

```ts
import { renderAvailableScriptsHelp } from '@karmaniverous/stan-cli';
```

Returns a help footer string listing available script keys (best-effort; returns `''` if config cannot be loaded).

### Script types

`@karmaniverous/stan-cli` also re-exports (for docs completeness) script config types:
- `ScriptEntry`, `ScriptMap`, `ScriptObject`

These describe the shape of `stan-cli.scripts` entries (string shorthand or object form).

## Prompt selection (run)

`stan run` (and `runSelected`) can resolve a system prompt source for archiving:

- `auto` (default): prefer local `<stanPath>/system/stan.system.md`; fall back to packaged core prompt.
- `local`: require `<stanPath>/system/stan.system.md`.
- `core`: use packaged prompt from `@karmaniverous/stan-core`.
- `<path>`: absolute or repo-relative path to a prompt file.

Archiving behavior:
- Full archive always contains `<stanPath>/system/stan.system.md` representing the prompt used for the run (materialized temporarily when needed).
- Diff archive suppresses `stan.system.md` in steady state for `core`/`<path>` sources when unchanged vs snapshot baseline; it appears once when the effective prompt changes.

## Facet overlay (run “view”)

Facet overlay is CLI-owned; it changes what the engine sees via composed `excludes` (deny-list) and `anchors` (high-precedence re-includes).

Facet files (under `<stanPath>/system/`):
- `facet.meta.json`: durable facet definitions (`exclude` patterns + `include` anchor paths)
- `facet.state.json`: next-run default activation (`true` = active, `false` = inactive)
- `.docs.meta.json`: stores overlay metadata for the last run (enabled/effective/autosuspended/anchorsKept, etc.)

Run flags:
- `-f, --facets` enables overlay for this run
- `-F, --no-facets` disables overlay for this run
- `--facets-on <names...>` forces named facets active (this run only; does not persist)
- `--facets-off <names...>` forces named facets inactive (this run only; does not persist)

Overlay safety:
- When a facet is inactive by default/state and its excluded subtree has no on-disk anchors, the CLI may auto-suspend the drop (treat it active) to avoid accidentally hiding large areas without breadcrumbs.
- Explicit per-run `--facets-off` must remain off (no auto-suspension).

## Common integration pitfalls

- Wrong `stanPath`: always read it from `stan-core.stanPath` (do not assume `.stan`).
- Legacy configs: avoid depending on legacy root keys; migrate with `stan init`.
- Combine without archives: enforce `archive=true` when `combine=true`.
- Multi-file diffs: `stan patch` enforces a single-file unified diff (one target) per apply payload.
- Non-TTY environments: live UI is skipped; expect logger-style output behavior.

## Maintenance note (policy reminder)

If public exports, config shape/semantics, prompt behavior, overlay behavior, or patch/snap contracts change, update this guide in the same change set.
