# STAN Development Plan

When updated: 2025-10-11 (UTC)

This plan tracks near‑term and follow‑through work for the stan‑cli package (CLI and runner). The stan‑core split is complete; engine work is tracked in the stan‑core repository.

---

## Next up (priority order)

1. System prompt selection (run) — `-m, --prompt`

- Flags and defaults:
  - Accept {'auto' | 'local' | 'core' | <path>}, default 'auto'; support `cliDefaults.run.prompt`.
- Resolution & guards:
  - `auto` → local else core; early error if neither available.
  - `local` requires `<stanPath>/system/stan.system.md`; `core` requires packaged `dist/stan.system.md`; `<path>` requires readable file.
- Materialization:
  - Present the chosen prompt under `<stanPath>/system/stan.system.md` for both full and diff; restore prior state afterward; avoid gratuitous rewrites (byte‑compare).
- Plan header:
  - Include `prompt:` line (e.g., `auto → core (@karmaniverous/stan-core@X.Y.Z)`).
- Tests:
  - All modes; early errors; plan line; diff includes prompt when changed vs snapshot.

2. Remove “drift/docs changed” preflight prints from `run` and `snap`

- Strip preflight calls/prints in these flows (retain elsewhere only if explicitly required).
- Update affected tests (remove preflight spies/expectations).

3. Archive pipeline update

- Remove “packaged‑only for full” injection in `archivePhase`; instead rely on the prepared prompt for both full and diff.
- Preserve imports staging and combine/cleanup behaviors.

4. Docs & help updates

- CLI help: add `-m, --prompt` with `(default: auto)`.
- Docs: CLI usage and Archives/Snapshots reflect:
  - prompt source resolution and plan header line,
  - drift‑notice removal in run/snap,
  - script execution environment (PATH, CWD, shell).

---

## Backlog / follow‑through

- Snapshot UX follow‑through
  - Improve `snap info` formatting (clearer current index marking; optional time‑ago column).

- Live UI niceties (post‑stabilization)
  - Optional Output column truncation to available columns (avoid terminal wrapping when paths are long).
  - Optional alt‑screen mode (opt‑in; disabled by default).

- Docs/site
  - Expand troubleshooting for “system prompt not found” and PATH issues with suggestions (`--prompt core`, install missing devDeps, or invoke via package manager).

---

## Acceptance criteria (near‑term)

- `stan run`:
  - `-m/--prompt` fully supported; `cliDefaults.run.prompt` honored.
  - Early failure pathways print one concise error and do not run scripts/archives.
  - Plan header prints `prompt:` line (except with `-P`).
  - The system prompt is part of both full and diff flows; restoration occurs on completion/error; no gratuitous rewrites.
  - Child PATH augmentation ensures repo‑local binaries resolve without globals across platforms/monorepos.
- `stan snap`:
  - No drift/docs messages printed; snapshot behavior and history unchanged.
- Tests:
  - Coverage for all `--prompt` modes, early errors, plan header, diff participation, drift‑notice removal in run/snap, and PATH augmentation behavior.

---

## Completed (recent)

- Script runner environment — PATH augmentation
  - Added PATH augmentation before each script spawn so repo binaries resolve without global installs.
  - Behavior:
    - Prefix child PATH with `<repoRoot>/node_modules/.bin` and each ancestor `<dir>/node_modules/.bin` up to the filesystem root (nearest first).
    - Cross‑platform: use `path.delimiter`; set `PATH` (Windows case‑insensitive).
    - No command rewriting; preserve `cwd=repoRoot`, `shell=true`; pass through parent env with augmented PATH.
    - No runtime deps added for user tools (e.g., `cross-env`).
    - If no `.bin` exists (e.g., Yarn PnP), augmentation is a no‑op.
  - Implementation:
    - Introduced `computeBinPathChain(repoRoot)` in `src/stan/run/exec.ts`.
    - Child processes spawned with `env: { ...process.env, PATH: "<bins><delimiter><orig>" }`.
  - Tests:
    - Added a test to verify child PATH is prefixed with `<repoRoot>/node_modules/.bin` and visible in the script output.

- Live/Logger parity and stability
  - Final‑frame newline; stable hint behavior; BORING tokens in logger.
  - Sequential scheduler gate prevents post‑cancel spawns; archives skipped on cancel; non‑zero exit.
  - Anchored writer ensures in‑place updates without scrollback loss; hides/shows cursor reliably.

- Patch classification and diagnostics hardening
  - File Ops vs Diff split with FO‑only acceptance; single‑file diff enforcement; diagnostics envelopes with declared paths and attempt summaries; editor open on success (non‑check); `.patch` persisted for audit.

- CLI config & defaults
  - Root defaults for `debug`/`boring` respected; run defaults surfaced in help (Commander default annotations).
  - Plan printing toggles (`-p`/`-P`) honored; plan only exits without side effects.
