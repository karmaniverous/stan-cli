# STAN — Requirements (stan‑cli)

This document defines the durable, CLI‑focused requirements for STAN’s command‑line interface and runner (“stan‑cli”). It assumes the engine (“stan‑core”) is a separate package that exposes deterministic, presentation‑free services. Where appropriate, stan‑core surfaces are referenced explicitly; stan‑cli must remain a thin adapter over those services.

---

## 1) Purpose

Provide the user‑facing CLI (Commander‑based) and runner/TTY experience (live progress table, cancellation keys, concise logs) while delegating selection, archiving/diff/snapshot, patch application, and prompt utilities to stan‑core.

stan‑cli is the only place where process/TTY/clipboard/editor concerns are handled. It owns UX, composition, and orchestration; stan‑core owns data‑level decisions.

---

## 2) Scope (CLI subcommands and behaviors)

### 2.1 Run (build & snapshot)

- Invoke configured scripts (concurrent by default; sequential optionally).
- Produce deterministic outputs under `<stanPath>/output/*.txt`.
- Create both:
  - `<stanPath>/output/archive.tar` — full snapshot (text files per selection rules),
  - `<stanPath>/output/archive.diff.tar` — changed files vs snapshot (always when archiving).
- Render a live TTY progress table or concise logger lines in non‑TTY.
- Handle cancellation:
  - ‘q’ (TTY) or SIGINT cancels; archives are skipped; non‑zero exit (best‑effort).
  - Sequential scheduling gate prevents spawning further scripts after cancel.
- Combine mode (`-c/--combine`): include `<stanPath>/output` inside archives and remove on‑disk outputs after archiving (archives remain).
- Always restore workspace invariants on exit (TTY handlers, raw mode, cursor).

Script execution environment (required):

- CWD: Spawn scripts with `cwd` set to the repo root containing the resolved `stan.config.*`.
- Shell: Spawn with `shell: true` (platform default shell).
- PATH augmentation (hard requirement):
  - Before each script spawn, stan‑cli MUST prepend the following to the child’s PATH so repo dependencies are preferred and available without global installs:
    - `<repoRoot>/node_modules/.bin`
    - Each ancestor `<dir>/node_modules/.bin` walking upward to the filesystem root (nearest first, then parents) — this mimics npm’s script resolution in monorepos/workspaces.
  - Cross‑platform:
    - Use `path.delimiter` for concatenation (`:` on POSIX, `;` on Windows).
    - Set the environment variable key as `PATH` (Node normalizes case‑insensitively on Windows).
  - Stability:
    - Do not rewrite or wrap user commands (no implicit `npm exec`/`npx`); simply provide PATH so binaries like `cross-env` resolve locally.
    - If no `node_modules/.bin` directories exist (e.g., Yarn PnP), augmentation is a no‑op; scripts may still invoke via the package manager or nested npm scripts.
  - Non‑goals:
    - stan‑cli MUST NOT add user toolchains (e.g., `cross-env`) as runtime dependencies; resolution must rely on the target repo’s installation.
  - Precedence:
    - The augmented PATH MUST ensure local `.bin` entries take precedence over global binaries.

NEW — System prompt source (required; hard‑guarded):

- Flags: `-m, --prompt <value>` where `<value>` ∈ {'auto' | 'local' | 'core' | <path>}, default 'auto'.
- Resolution:
  - ‘local’: require `<stanPath>/system/stan.system.md` to exist; error if missing.
  - ‘core’: require packaged baseline from stan‑core (`getPackagedSystemPromptPath()`); error if missing.
  - ‘auto’ (default): prefer ‘local’; fall back to ‘core’; error if neither is available.
  - `<path>`: use the specified file (absolute or repo‑relative). Require readability; error if missing.
- Materialization & diff:
  - The resolved prompt is materialized at `<stanPath>/system/stan.system.md` for the entire archive phase (both full and diff).
  - It is always present in the full archive, and participates in the diff like any other file (appears in `archive.diff.tar` if it changed vs snapshot).
  - If stan‑cli writes or overwrites the file to present the chosen source, stan‑cli MUST restore prior state afterward (put original bytes back, or remove the file if it did not exist).
- No drift/version nudges:
  - stan‑cli MUST NOT print “drift” or “docs changed” preflight hints in `stan run`. (Those nudges belong elsewhere; the run behavior is authoritative based on the `--prompt` source.)
- Plan header:
  - The run plan printed by stan‑cli MUST include a single line that reflects the resolved system prompt for the run:
    - Examples:
      - `prompt: local (.stan/system/stan.system.md)`
      - `prompt: core (@karmaniverous/stan-core@<version>)`
      - `prompt: auto → local (.stan/system/stan.system.md)`
      - `prompt: /abs/or/relative/path/to/custom.system.md`
  - When `-P/--no-plan` is used, no plan (and thus no prompt line) is printed.

Run flags (complete set; precedence = flags > cliDefaults > built‑ins):

- Selection:
  - `-s, --scripts [keys...]` (presence w/o keys => run all known scripts)
  - `-S, --no-scripts` (conflicts with `-s`/`-x`)
  - `-x, --except-scripts <keys...>`
- Mode:
  - `-q, --sequential` / `-Q, --no-sequential`
- Archives/outputs:
  - `-a, --archive` / `-A, --no-archive`
  - `-c, --combine` / `-C, --no-combine` (implies archive; conflicts with `-A`)
  - `-k, --keep` / `-K, --no-keep`
- Plan:
  - `-p, --plan` (plan only; exit)
  - `-P, --no-plan` (suppress plan header; execute directly)
- Live UI and thresholds:
  - `-l, --live` / `-L, --no-live`
  - `--hang-warn <seconds>` (positive int; default 120)
  - `--hang-kill <seconds>` (positive int; default 300)
  - `--hang-kill-grace <seconds>` (positive int; default 10)
- System prompt:
  - `-m, --prompt <value>` as defined above.
- Defaults (built‑ins unless overridden by `cliDefaults.run.*`):
  - `archive=true`, `combine=false`, `keep=false`,
  - `sequential=false`, `live=true`,
  - `hangWarn=120`, `hangKill=300`, `hangKillGrace=10`,
  - `scripts=true` (when `-s` is omitted),
  - `prompt='auto'` (new).

Plan rendering (TTY and non‑TTY):

- Multi‑line plan body includes:
  - `mode`, `output`, `prompt`, `scripts`, `archive`, `combine`, `keep output dir`, `live`, and hang thresholds.
- Plan only (`-p`): prints plan and exits with no side effects.

### 2.2 Patch (discuss & apply)

- Source of patch data (precedence):
  1. [input] argument (patch text),
  2. `-f, --file [filename]` (path explicit or from `cliDefaults.patch.file` unless `-F/--no-file`),
  3. clipboard (default fallback).
- Kind classification (hard rules):
  - File Ops (“### File Ops”): structural changes only (mv/cp/rm/rmdir/mkdirp); may include many operations; dry‑run under `--check`.
  - Diff (plain unified): exactly one file per Patch block (single‑file rule); jsdiff fallback engaged only after git‑apply cascade fails; robust EOL/whitespace handling.
  - File Ops + Diff in the same payload: invalid (compose diagnostics envelope).
- Persistence/audit:
  - Save raw patch to `<stanPath>/patch/.patch`.
  - Place rejects under `<stanPath>/patch/rejects/<UTC>/` when applicable.
- Diagnostics:
  - Compose compact envelope(s) with declared target paths, attempt summaries, and jsdiff reasons (if any); copy to clipboard best‑effort.
  - On diagnostics replies from the user, the assistant must produce Full, post‑patch listings only for the affected files (no diffs), no commit message (assistant‑side rule).
- Editor:
  - Open modified file on success (non‑check) using `patchOpenCommand` (default `code -g {file}`), best‑effort/detached.

### 2.3 Snap (share & baseline)

- Write/update `<stanPath>/diff/.archive.snapshot.json`.
- Maintain bounded undo/redo history under `<stanPath>/diff` with retention `maxUndos` (default 10).
- Optional stash:
  - `-s, --stash` (git stash -u then pop), `-S, --no-stash`.
  - Success/empty stash logged concisely; on failure, abort without writing a snapshot.
- Selection is derived from repo config (includes/excludes); snapshot fidelity matches run’s underlying selection logic.
- No drift/version nudges: stan‑cli MUST NOT print “drift”/“docs changed” hints in `stan snap`.

### 2.4 Init (project bootstrap)

- Scan `package.json` scripts; prompt user (interactive) or write defaults (`--force`) to create/update `stan.config.yml|yaml|json`.
- Preserve unknown keys and key order when rewriting existing config.
- Ensure `.gitignore` entries for `<stanPath>/{output,diff,dist,patch}/`.
- Write docs metadata `<stanPath>/system/.docs.meta.json` with the installed CLI version (best‑effort). Do not install a prompt monolith here.
- Seed diff snapshot when missing (best‑effort).

---

## 3) Non‑goals (stan‑cli)

- Engine responsibilities:
  - No selection logic, classification, archive writing, diff/snapshot computation, or patch application logic beyond adapter mapping — stan‑core owns those.
- No console I/O from stan‑core:
  - Engine APIs are presentation‑free; stan‑cli MUST NOT depend on core sending logs.
- No drift/version nudges in `run` and `snap`:
  - Those were removed; run behavior is authoritative via `--prompt`.

---

## 4) Interactions with stan‑core (explicit dependencies)

stan‑cli composes the following stan‑core surfaces (representative):

- Config:
  - `loadConfig(cwd)` / `loadConfigSync(cwd)` for repo config (ContextConfig).
  - `ensureOutputDir(cwd, stanPath, keep)` to prepare workspace.
- Archive & snapshot:
  - `createArchive(cwd, stanPath, options)` → `archive.tar`
  - `createArchiveDiff({ cwd, stanPath, baseName, includes, excludes, updateSnapshot, includeOutputDirInDiff })` → `{ diffPath }`
  - `writeArchiveSnapshot({ cwd, stanPath, includes, excludes })`
  - `prepareImports({ cwd, stanPath, map })` (stages imports under `<stanPath>/imports/<label>/...`)
- Prompt helpers:
  - `getPackagedSystemPromptPath()` to locate packaged baseline (`dist/stan.system.md`).
- Patch engine:
  - `detectAndCleanPatch(...)`, `parseFileOpsBlock(...)`, `executeFileOps(...)`, `applyPatchPipeline(...)` (adapter pattern only; CLI acquires sources and prints diagnostics).

All core calls MUST be deterministic and presentation‑free; stan‑cli is responsible for user‑visible logs and UI.

---

## 5) CLI composition & defaults

- Precedence: flags > `cliDefaults` > built‑ins.
- Supported defaults under `cliDefaults.run`:
  - `archive`, `combine`, `keep`, `sequential`, `plan`, `live`, `hangWarn`, `hangKill`, `hangKillGrace`, `scripts`, and `prompt` (new).
- Supported defaults under:
  - `cliDefaults.patch.file`, `cliDefaults.snap.stash`,
  - Root defaults: `cliDefaults.debug`, `cliDefaults.boring`.
- Plan header MUST reflect the effective values (including the resolved `prompt`).

---

## 6) Presentation & logs

- Live UI (TTY):
  - Single table with flush‑left alignment; stable header, summary, and hint.
  - Keys: ‘q’ (cancel), ‘r’ (restart current session only; scripts re‑queued).
  - No alt‑screen by default; cursor hidden during updates; restored on stop.
- Logger (non‑TTY):
  - Concise per‑event lines with BORING tokens (`[WAIT]`, `[RUN]`, `[OK]`, `[FAIL]`, …).
- BORING detection:
  - Honor `STAN_BORING=1` (and `NO_COLOR=1`, `FORCE_COLOR=0`); always print stable, unstyled tokens under BORING/non‑TTY.

---

## 7) Error handling & guardrails

- System prompt resolution error (run):
  - stan‑cli MUST fail early (no scripts/archives) when `--prompt` cannot be resolved.
  - One concise error line with helpful guidance (e.g., suggest `--prompt core`).
  - Non‑zero exit code (best‑effort).
- Archive restore:
  - If stan‑cli changed `<stanPath>/system/stan.system.md` to present the chosen prompt, it MUST restore previous state after both full and diff phases (or on error).
- Cancellation:
  - SIGINT parity for live/no‑live; archives skipped on cancel path.
  - Sequential scheduler gate MUST prevent new spawns after cancel.
- Stability:
  - Avoid gratuitous rewrites of the system prompt (compare bytes before writing) to prevent spurious diffs.

---

## 8) Testing (representative coverage)

- Option parsing & plan:
  - `-m/--prompt` present; Commander help shows `(default: auto)` (or config default).
  - Plan includes `prompt:` line (or is suppressed by `-P`).
- Resolution/injection/restore:
  - `--prompt local` with present file: proceeds; no rewrite when identical.
  - `--prompt local` missing: fails early; no artifacts.
  - `--prompt core`: proceeds; if we injected, restore afterward.
  - `--prompt auto`: prefers local; then core; failure when neither.
  - `--prompt <path>`: proceeds; restore afterward.
- Diff visibility:
  - If prompt changes vs snapshot, `archive.diff.tar` includes it; if unchanged, it does not.
- Removal of drift hints:
  - No “drift” or “docs changed” prints in `run` or `snap`.
- Cancellation:
  - Live/no‑live parity: no archives on cancel; non‑zero exit.
  - Sequential gate prevents post‑cancel scheduling.
- Script runner PATH:
  - Child PATH MUST include `<repoRoot>/node_modules/.bin` (and ancestor `.bin` directories in nearest‑first order).
  - Behavioral test with a stub binary in `node_modules/.bin` MUST execute successfully without global installs.
  - When `.bin` folders are absent (e.g., PnP), augmentation is a no‑op.

---

## 9) Documentation & versioning

- CLI help and docs MUST reflect:
  - `-m, --prompt` option and default resolution,
  - Plan header `prompt:` line,
  - Drift‑notice removal in `run` and `snap`,
  - Script execution environment (PATH augmentation, CWD, shell).
- Semantic versioning for the CLI package; changelog MUST call out:
  - New `--prompt` behavior,
  - Plan header prompt line,
  - Removal of run/snap drift messages,
  - Diff now truthfully includes prompt changes,
  - Script runner PATH augmentation so repo devDeps resolve without globals.

---
