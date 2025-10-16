# STAN Development Plan

## Next up (priority order)

- Deprecation staging for config ingestion
  - Phase 1: keep legacy extractor + loader fallback; emit debugFallback notices when used; changelog guidance to run “stan init”.
  - Phase 2: require STAN_ACCEPT_LEGACY=1 for legacy; otherwise fail early with a concise message (“Run ‘stan init’ to migrate config.”).
  - Phase 3: strict stan‑cli only (remove legacy acceptance).

- Docs & help updates
  - Configuration: namespaced layout only; “Migration” appendix → “run stan init”.
  - Getting Started/CLI Usage: note prompt flag and PATH augmentation (already covered).
  - Init help: mention migration and .bak/--dry‑run.
  - Contributor note: barrels and cycle‑avoidance (do not import the session barrel from within session submodules; prefer local relative imports when a barrel would induce a cycle).

- Test follow‑through
  - Add small parity checks for include‑on‑change on Windows/POSIX (core|path sources).
  - Quick unit around top‑level index exports to guard against accidental “barrel of barrels”.

## Backlog / follow‑through

- Snapshot UX
  - Improve `snap info` formatting (clearer current index marking; optional time‑ago column).

- Live UI niceties (post‑stabilization)
  - Optional Output column truncation to available columns (avoid terminal wrapping when paths are long).
  - Optional alt‑screen mode (opt‑in; disabled by default).

- Docs/site
  - Expand troubleshooting for “system prompt not found” and PATH issues with suggestions (`--prompt core`, install missing devDeps, or invoke via pkg manager).

---

## Acceptance criteria (near‑term)

- Config swing:
  - stan init migrates legacy → namespaced; backup + dry‑run supported. [PENDING]
  - Legacy engine keys honored via synthesized ContextConfig during transition; debugFallback notice only. [PENDING]
  - Deprecation phases implemented (env‑gated, then strict). [PENDING]
- Tests/docs:
  - Migration tests (YAML/JSON/mixed; idempotent; backups; dry‑run). [PENDING]
  - Transitional extraction tests (legacy excludes/includes honored). [PENDING]
  - Docs updated (namespaced examples; migration appendix; init help). [PENDING]

---

## Completed (recent)

- CI speed — shorten matrix durations
  - Reduced the dummy wait script in cancellation matrix tests from 10s to 2s and shortened teardown settle. This cuts per-case wall clock while preserving coverage across live/no‑live × mode × signal × archive.

- Build guard — fail build on new circular dependencies
  - Added a simple CI guard in rollup.config.ts: onwarn now throws on Rollup CIRCULAR_DEPENDENCY warnings that do not originate from node_modules.
  - Known third‑party cycles (e.g., zod in node_modules) remain allowed; project‑local cycles now fail the build to prevent regressions.

- Cancellation stabilization — follow‑through
  - Verified the cancellation matrix across live/no‑live × mode × signal × archive; archives are skipped on cancel and exit code is non‑zero.
  - Added a tiny CI‑only POSIX increase to the secondary late‑cancel settle window to absorb very‑late signals without impacting local runs.

- PATH augmentation test fix
  - Fixed src/runner/run/exec.envpath.test.ts by importing `rm` from `node:fs/promises` for the “no-node_modules” scenario. This resolves the typecheck error (TS2304: Cannot find name 'rm'), clears the lint error on that line, and makes the failing test pass.
