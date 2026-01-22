---
title: Stan Configuration
---

# Stan Configuration (stan.config.yml / stan.config.json)

This guide explains every configuration key, how STAN finds your config, how file selection works (includes/excludes), and how phase‑scoped CLI defaults (cliDefaults) influence the CLI when flags are omitted.

Related guides:
- [CLI Usage & Examples](./cli-examples.md)
- [Archives & Snapshots](./archives-and-snapshots.md)
- [Migration — Namespaced Configuration](./migration.md)

- Formats: YAML (recommended) or JSON.
- Location: STAN searches upward from the current working directory for the nearest `stan.config.yml|yaml|json`.

Minimal YAML example:

```yaml
stan-core:
  stanPath: .stan
  includes: []
  excludes: []
stan-cli:
  scripts:
    build: npm run build
    lint: npm run lint
    test: npm run test
    typecheck: npm run typecheck
```

## Resolution rules (where STAN reads config)

- STAN starts at the working directory and looks for the nearest `stan.config.yml`, `stan.config.yaml`, or `stan.config.json`.
- The directory containing that file becomes the “repo root” for the current STAN run.
- If no config is found, STAN falls back to defaults where applicable (for example, default `stanPath` is `.stan`) but many operations require an explicit config.
- **Workspace context**: You can change the effective working directory using the `-w/--workspace <query>` global flag. This runs STAN in the context of a sub-package without needing to `cd` manually.

## Top‑level keys

### stan-core (engine)

Keys in this section are owned by the engine and control file selection and workspace paths.

#### stanPath (string)

Workspace folder for STAN’s operational files.

- Default: `.stan`
- Typical layout under `<stanPath>/`:
  - `system/` — prompts and docs metadata
  - `output/` — script outputs and `archive.tar`/`archive.diff.tar`
  - `imports/` — staged external context (gitignored; included in archives automatically)
  - `diff/` — snapshot/history (`.archive.snapshot.json`, `.snap.state.json`, prior archives)
  - `patch/` — canonical patch workspace
  - `dist/` — dev build area for internal tasks (not published)

#### includes (string[])

Additive allow‑list of glob patterns. Matches are ADDED back to the base selection even if they would otherwise be excluded by `.gitignore` or default denials.

- Explicit `excludes` take precedence over `includes` (excludes win).
- Reserved exclusions still apply:
  - `<stanPath>/diff` is always excluded.
  - `<stanPath>/output` is excluded unless combine mode includes it for archiving.

Use when you want to bring back files that would otherwise be ignored (e.g., docs or generated artifacts you do want to share).

```yaml
includes:
  - '**/*.md'
  - 'docs/**'
```

#### excludes (string[])

Deny‑list of glob/prefix patterns applied to the base selection in addition to default denials and `.gitignore`.

- Default denials: `.git`, `node_modules`.
- STAN workspace rules:
  - Always exclude `<stanPath>/diff`.
  - Exclude `<stanPath>/output` unless combine mode includes it.
- Precedence: `excludes` take priority over `includes`.

```yaml
excludes:
  - '**/.tsbuild/**'
  - '**/generated/**'
```

Tip: Use excludes to reduce archive noise (tool state folders, large generated code) and use includes to bring back specific assets you want to share.

### stan-cli (CLI)

Keys in this section are owned by the CLI (runner and adapters).

#### scripts (object of string | object)

Map of script keys to shell commands that STAN executes during `stan run`. The combined stdout/stderr of each command is written to `<stanPath>/output/<key>.txt`.

Example:

```yaml
stan-cli:
  scripts:
    build: npm run build
    lint: npm run lint
    test: npm run test
    typecheck: npm run typecheck
```

Notes:

- Keys are free‑form (e.g., `build`, `docs`, `lint`).
- Disallowed keys: `archive`, `init` (reserved by STAN).

#### maxUndos (number)

Retention for snapshot history (`stan snap undo|redo|set`). Default: `10`.

```yaml
maxUndos: 10
```

#### patchOpenCommand (string)

Editor command template used to open modified files after a successful `stan patch`. The token `{file}` expands to a repo‑relative path.

- Default: `code -g {file}` (VS Code; opens at the first line).
- Examples:
  - WebStorm: `webstorm64.exe {file}`
  - Cursor: `cursor -g {file}`

```yaml
patchOpenCommand: 'code -g {file}'
```

#### devMode (boolean) [optional]

Developer‑mode switch used by STAN’s own repo to detect when local development is happening (affects prompt assembly and preflight nudges). Consumers typically do not set this.

```yaml
devMode: false
```

#### cliDefaults (object)

Phase‑scoped defaults used when CLI flags are omitted. Precedence: flags > cliDefaults > built‑ins.

Schema:

```yaml
cliDefaults:
  # root flags
  debug: false # -d / -D
  boring: false # -b / -B
  run:
    archive: true # -a / -A; combine implies archive=true
    combine: false # -c / -C
    keep: false # -k / -K
    sequential: false # -q / -Q
    plan: true # print the run plan header before execution when -p/-P not specified
    live: true # -l / -L
    hangWarn: 120
    hangKill: 300
    hangKillGrace: 10
    # default script selection when neither -s nor -S is provided:
    #   true  => all scripts,
    #   false => none,
    #   ["a","b"] => only these keys
    scripts: true
    # Note: facets controls whether the overlay is enabled by default.
    # It does not implicitly activate all facets; per-facet activation still comes
    # from <stanPath>/system/facet.state.json plus any per-run overrides.
  patch:
    # default patch file when no argument/-f is provided, unless -F/--no-file is used
    file: .stan/patch/last.patch
  snap:
    stash: false # -s / -S
```

Examples:

- Default to all scripts, but disable archives unless requested:

```yaml
cliDefaults:
  run:
    scripts: true
    archive: false
```

- Prefer sequential runs and capture a default patch file:

```yaml
cliDefaults:
  run:
    sequential: true
  patch:
    file: .stan/patch/pending.patch
```

- Prefer stashing before snapshot:

```yaml
cliDefaults:
  snap:
    stash: true
```

## File selection (archives & snapshots)

STAN selects files in two passes:

1. Base selection

- Applies `.gitignore` semantics, default denials (`node_modules`, `.git`), user `excludes`, and STAN workspace rules.
- Reserved exclusions:
  - Always exclude `<stanPath>/diff`.
  - Exclude `<stanPath>/output` unless combine mode is enabled (archives include outputs and then remove them on disk).

2. Additive includes

- Patterns in `includes` ADD matched files back into the selection even if excluded by `.gitignore` or default denials.
- Explicit `excludes` still win over `includes`.

### Default sub‑package exclusion

STAN excludes nested sub‑packages by default to reduce noise:

- Any directory (at any depth) that contains its own `package.json` is treated as an independent sub‑package and excluded from the base selection.
- The repository root itself (root‑level `package.json`) is not excluded.
- Reserved exclusions still apply (see above).

To include a specific sub‑package, add an `includes` glob. For example:

```yaml
includes:
  - 'packages/app1/**' # re‑include a nested package
```

## CLI defaults & precedence

- Flags override everything.
- If a flag is omitted, STAN consults `cliDefaults`.
- If not in `cliDefaults`, STAN uses built‑ins:
  - `run.archive=true`, `run.combine=false`, `run.keep=false`, `run.sequential=false`, `run.scripts=true`, `run.live=true`
  - Hang thresholds (TTY-oriented):
    - `run.hangWarn=120` (seconds before labeling “stalled”),
    - `run.hangKill=300` (seconds before escalating from SIGTERM→SIGKILL),
    - `run.hangKillGrace=10` (seconds grace between TERM and KILL).
  - `patch.file` unset
  - `snap.stash=false`
  - root: `debug=false`, `boring=false`

Examples:

- Run all scripts and archive (built‑ins) vs config turning off archive:

```bash
# Built-ins: archives enabled
stan run

# With config:
# cliDefaults.run.archive=false
# => No archives unless you pass -a
stan run
stan run -a   # force archives this time
```

- Plan toggles:

```bash
stan run -p   # print the plan and exit
stan run -P   # execute without printing the plan first
```

## Practical snippets

- YAML with glob excludes and additive includes:

```yaml
stan-core:
  stanPath: .stan
  excludes:
    - '**/.tsbuild/**'
    - '**/generated/**'
  includes:
    - 'docs/**' # bring docs back even if ignored
    - '**/*.md'
stan-cli:
  scripts:
    lint: npm run lint
    test: npm run test
  maxUndos: 10
  patchOpenCommand: 'code -g {file}'
  cliDefaults:
    run:
      scripts: true
      archive: true
      sequential: false
    snap:
      stash: false
```

- JSON variant (stan.config.json):

```json
{
  "stan-core": {
    "stanPath": ".stan",
    "includes": [],
    "excludes": ["**/.tsbuild/**", "**/generated/**"]
  },
  "stan-cli": {
    "scripts": {
      "build": "npm run build",
      "lint": "npm run lint",
      "test": "npm run test",
      "typecheck": "npm run typecheck"
    },
    "maxUndos": 10,
    "patchOpenCommand": "code -g {file}",
    "cliDefaults": {
      "debug": false,
      "boring": false,
      "run": {
        "archive": true,
        "combine": false,
        "keep": false,
        "sequential": false,
        "live": true,
        "hangWarn": 120,
        "hangKill": 300,
        "hangKillGrace": 10,
        "scripts": true
      },
      "patch": {
        "file": ".stan/patch/last.patch"
      },
      "snap": {
        "stash": false
      }
    }
  }
}
```

## Tips

- Keep `scripts` deterministic: tests, typecheckers, and linters that always produce stable output are ideal.
- Use `excludes` to trim large/generated noise and `includes` to bring back specific assets you want to share.
- Prefer LF in your repo; STAN normalizes line endings when applying patches and counts LOC for large‑text warnings.
