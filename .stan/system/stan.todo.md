# STAN Development Plan

When updated: 2025-10-11 (UTC)

This plan tracks near‑term and follow‑through work for the stan‑cli package (CLI and runner). The stan‑core split is complete; engine work is tracked in the stan‑core repository.

---

## Next up (priority order)

1. Docs & help updates (reflect new --prompt and environment rules)

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
  - `-m/--prompt` fully supported; `cliDefaults.run.prompt` honored. [DONE]
  - Early failure pathways print one concise error and do not run scripts/archives. [DONE]
  - Plan header prints `prompt:` line (except with `-P`). [DONE]
  - The system prompt is part of both full and diff flows; restoration occurs on completion/error; no gratuitous rewrites. [DONE]
  - Child PATH augmentation ensures repo‑local binaries resolve without globals across platforms/monorepos. [DONE]
- `stan snap`:
  - No drift/docs messages printed; snapshot behavior and history unchanged. [DONE]
- Tests:
  - Coverage for PATH augmentation (repo bin precedence). [DONE]
  - (Follow‑through) Add coverage for prompt plan line and early failure cases.

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

- System prompt selection in run
  - Added `-m, --prompt <value>` with default `auto` and support for `cliDefaults.run.prompt`.
  - Resolution rules:
    - auto: prefer local `<stanPath>/system/stan.system.md`, fallback core (packaged).
    - local/core/path: require existence; early, concise error if not found (no scripts/archives).
  - Materialization:
    - Present chosen prompt under `<stanPath>/system/stan.system.md` for both full and diff; restore previous state after archiving; avoid gratuitous rewrites by byte-compare.
  - Plan header includes `prompt:` line with resolved source (e.g., `auto → core (@karmaniverous/stan-core@X.Y.Z)`).
  - Removed run/snap preflight drift/docs prints and updated tests accordingly (removed preflight tests).

- Live/Logger parity and stability
  - Final‑frame newline; stable hint behavior; BORING tokens in logger.
  - Sequential scheduler gate prevents post‑cancel spawns; archives skipped on cancel; non‑zero exit.
  - Anchored writer ensures in‑place updates without scrollback loss; hides/shows cursor reliably.

- Patch classification and diagnostics hardening
  - File Ops vs Diff split with FO‑only acceptance; single‑file diff enforcement; diagnostics envelopes with declared paths and attempt summaries; editor open on success (non‑check); `.patch` persisted for audit.

- CLI config & defaults
  - Root defaults for `debug`/`boring` respected; run defaults surfaced in help (Commander default annotations).
  - Plan printing toggles (`-p`/`-P`) honored; plan only exits without side effects.
