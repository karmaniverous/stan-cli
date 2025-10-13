---
title: CLI Usage & Examples
---

# CLI usage & examples

This page documents all CLI options and shows practical examples. STAN’s CLI honors phase‑scoped defaults from your configuration (cliDefaults) when flags are omitted; see “Config‑driven defaults” below.

## Root (stan) options

- -d, --debug / -D, --no-debug
  - Enable or disable verbose debug logging (default from config; built‑in default false).
  - When enabled, some child process output is mirrored to the console.
- -b, --boring / -B, --no-boring
  - Disable or enable all color/styling (default from config; built‑in default false).
  - When boring mode is on, STAN also sets NO_COLOR=1 and FORCE_COLOR=0.
- -v, --version
  - Print extended version and baseline‑docs status:
    - STAN version, Node version, repo root, stanPath,
    - whether your local system prompt matches the packaged baseline,
    - docs baseline version last installed.

Example:

```
stan -v
```

If you run `stan` with no subcommand and no config is found, STAN starts interactive init. Otherwise it prints the help (with a footer listing available run scripts).

---

## Run — options and defaults

By default, `stan run`:

- runs all configured scripts (concurrent),
- writes both archive.tar and archive.diff.tar.

Flags (presented in the same order as `stan run --help`):

- -s, --scripts [keys...]
  - Select specific script keys. If provided with keys, runs them (order preserved with -q). If provided without keys, selects all known scripts.
  - When -s is omitted, the default selection comes from config (see “Config‑driven defaults”).
- -S, --no-scripts
  - Do not run scripts. This conflicts with -s and -x.
  - If combined with -A as well, STAN prints the plan and does nothing else.
- -x, --except-scripts <keys...>
  - Exclude these keys. If -s is present, reduces the -s selection; otherwise reduces from the full set of known scripts.

- -m, --prompt <value>
  - System prompt source: `auto` (default), `local`, `core`, or a file `<path>`.
  - `auto`: prefer a local prompt at `<stanPath>/system/stan.system.md`; fall back to the packaged core prompt.
  - `core`: use the packaged baseline from `@karmaniverous/stan-core`.
  - `<path>`: use the specified file (absolute or repo‑relative).
  - Diffs suppress `stan.system.md` in steady state for `core`/`<path>` sources (the full archive always contains the prompt for the run). When the effective prompt changes since the last `stan snap`, it appears exactly once in `archive.diff.tar`.

- -q, --sequential / -Q, --no-sequential
  - Run sequentially (preserves -s order) or concurrently (default).

- -a, --archive / -A, --no-archive
  - Create (or skip) archive.tar and archive.diff.tar. Built‑in default: archive enabled unless explicitly negated. Note: -c implies -a.
- -c, --combine / -C, --no-combine
  - Include .stan/output inside archives and remove outputs from disk (combine mode).
  - Conflicts with -A (cannot combine while disabling archives).
- -k, --keep / -K, --no-keep
  - Keep (do not clear) the output directory across runs.

- -p, --plan
  - Print a concise run plan and exit with no side effects.
- -P, --no-plan
  - Execute without printing the run plan first.

Plan header contents:

- The plan includes a `prompt:` line that reflects the resolved system prompt source for the run (for example, `auto → local (.stan/system/stan.system.md)` or `@karmaniverous/stan-core@<version>` when `--prompt core` is used).
- This mirrors the effective prompt used during archiving and helps keep logs self‑describing.

- -l, --live / -L, --no-live
  - Enable/disable a live progress table in TTY. Built‑in default: enabled.
  - Non‑TTY runs (tests/CI) are unaffected and keep line‑per‑event logs.
- --hang-warn <seconds>
  - Label a running script as “stalled” after this many seconds of inactivity (TTY only).
- --hang-kill <seconds>
  - Terminate stalled scripts after this many seconds (SIGTERM → grace → SIGKILL; TTY only).
- --hang-kill-grace <seconds>
  - Grace period in seconds before SIGKILL after SIGTERM (TTY only).

Defaults (built‑in unless overridden by cliDefaults or flags):

- hang-warn 120s
- hang-kill 300s
- hang-kill-grace 10s

Live UI status legend (TTY)

- waiting: grey
- run: blue
- quiet: cyan
- stalled: magenta
- timeout: red
- ok: green
- error: red
- cancelled: black

Notes:

- In BORING mode (or non‑TTY), statuses render as bracketed tokens (e.g., [WAIT], [RUN], [QUIET], [STALLED], [TIMEOUT], [OK], [FAIL], [CANCELLED]) without color.
- No‑live parity: with --no-live and thresholds set, STAN logs concise inactivity events (“stalled/timeout/killed”) and preserves artifact parity with live runs (archives skipped on user cancel; outputs/archives otherwise identical given the same inputs and flags).
- Live mode suppresses legacy “stan: start/done …” archive lines; progress is rendered in the live table. In no‑live mode, those lines are printed as concise console logs.

Conflicts and special cases:

- -c conflicts with -A (combine implies archives).
- -S conflicts with -s and -x.
- -S plus -A (scripts disabled and archives disabled) => “nothing to do; plan only”.

Examples:

```
# Default: run all scripts and write archives
stan run

# Plan only (no side effects)
stan run -p

# Execute without printing the plan first
stan run -P

# Run a subset
stan run -s test lint
# Run all except a subset
stan run -x test

# Sequential execution (preserves -s order)
stan run -q -s lint test

# Combine mode: include outputs inside archives; remove them from disk
stan run -c

# Keep outputs on disk even after runs
stan run -k

# Disable scripts and archives (plan only)
stan run -S -A -p
```

## Patch — options and workflow

Patches must be plain unified diffs (git‑style headers) with LF line endings. STAN cleans and saves the diff to .stan/patch/.patch, then applies it safely (or validates with --check). On failure, it writes diagnostics and a FEEDBACK packet and (when possible) copies it to your clipboard.

Sources and precedence:

- [input] argument → highest precedence (treat as patch text).
- -f, --file [filename] → read from file; if -f is present without a filename, read from clipboard.
- (default) clipboard → if no argument/-f provided.
- -F, --no-file → ignore configured default patch file (forces clipboard unless argument/-f provided).
- Config default: cliDefaults.patch.file (see below).

Flags (presented to match `stan patch --help`):

- -f, --file [filename]
  - Read the patch from a file (see precedence above).
- -F, --no-file
  - Ignore configured default patch file (use clipboard unless argument/-f provided).
- -c, --check
  - Validate only. Writes patched files to a sandbox under .stan/patch/.sandbox/ and leaves repo files unchanged.

Behavior highlights:

- Cleaned patch written to .stan/patch/.patch; diagnostics to .stan/patch/.debug/.
- Apply pipeline:
  - Tries “git apply” with tolerant options across -p1 → -p0; falls back to a jsdiff engine when needed (and to a sandbox when --check).

On success:

- [OK] patch applied (or “patch check passed”), and modified files can be opened in your editor using patchOpenCommand (default: "code -g {file}").

On failure:

- Writes a compact FEEDBACK envelope to .stan/patch/.debug/feedback.txt and (when possible) copies it to your clipboard; move any new \*.rej files to .stan/patch/rejects/<UTC>/.
- Paste the FEEDBACK block into chat to receive a corrected diff.

Examples:

```
# Clipboard (default)
stan patch

# Validate only
stan patch --check

# From a file
stan patch -f changes.patch
```

---

## Snap — options and subcommands

Snapshots help STAN compute diffs over time and maintain a bounded undo/redo history.

Main command:

- `stan snap`
  - Writes/updates .stan/diff/.archive.snapshot.json and captures current archives into history when present.

Flags:

- -s, --stash / -S, --no-stash
  - Stash changes (git stash -u) before snapshot and pop after; built‑in default: no-stash (config‑driven default supported).
  - If the stash attempt fails, STAN aborts without writing a snapshot.

Subcommands:

- `stan snap info` — print the snapshot stack (newest → oldest) with the current index.
- `stan snap undo` — revert to the previous snapshot in history.
- `stan snap redo` — advance to the next snapshot in history.
- `stan snap set <index>` — jump to a specific snapshot index and restore it.

History:

- Lives under .stan/diff/:
  - .snap.state.json (stack and pointer),
  - snapshots/snap-<UTC>.json (previous snapshot contents),
  - archives/ (optional captured archives).
- Retention is bounded by maxUndos (default 10; configurable).

---

## Init — options

`stan init` scans your package.json, lets you pick scripts, writes stan.config.yml, ensures workspace folders and .gitignore entries, and writes docs metadata under .stan/system/.

Options:

- -f, --force
  - Create stan.config.yml with defaults (non‑interactive). Defaults: stanPath=.stan, empty includes/excludes, no scripts unless preserved.
- --preserve-scripts
  - Keep existing scripts from an older stan.config.\* when present.
  - Otherwise you’ll be prompted to select scripts from package.json.

---

## Config‑driven defaults (opts.cliDefaults)

Phase‑scoped defaults are read from your config when flags are omitted. Precedence: flags > cliDefaults > built‑ins.

Example:

```yaml
cliDefaults:
  # Root
  debug: false
  boring: false

  # Run defaults
  run:
    archive: true # -a / -A
    combine: false # -c / -C
    keep: false # -k / -K
    sequential: false # -q / -Q
    # scripts default when -s is omitted:
    #   true => all, false => none, ["lint","test"] => only these keys
    scripts: true

  # Patch defaults
  patch:
    file: .stan/patch/last.patch

  # Snap defaults
  snap:
    stash: false
```

---

## Negative short flags (quick reference)

- -D => --no-debug
- -B => --no-boring
- -P => --no-plan
- -Q => --no-sequential
- -K => --no-keep

---

## Quick examples

```
# Typical loop
stan run                     # build & snapshot
stan patch -f fix.patch      # apply unified diff
stan snap                    # update baseline

# Focused run
stan run -q -s lint test     # sequential; run only lint and test

# Combine mode and plan
stan run -c -p               # plan only; combine would include outputs in archives
```
