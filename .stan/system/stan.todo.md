# STAN Development Plan

When updated: 2025-10-13 (UTC)

This plan tracks near‑term and follow‑through work for the stan‑cli package (CLI and runner). The stan‑core split is complete; engine work is tracked in the stan‑core repository.

---

## Next up (priority order)

- Changelog / release notes
  - Document: prompt include‑on‑change behavior, DRY barrel removal, dynamic TTY detection, PATH augmentation note.
  - Cut next patch release once docs are updated.

- Deprecation staging for config ingestion
  - Phase 1: keep legacy extractor + loader fallback; emit debugFallback notices when used; changelog guidance to run “stan init”.
  - Phase 2: require STAN_ACCEPT_LEGACY=1 for legacy; otherwise fail early with a concise message (“Run ‘stan init’ to migrate config.”).
  - Phase 3: strict stan-cli only (remove legacy acceptance).

- Docs & help updates
  - Configuration: namespaced layout only; “Migration” appendix → “run stan init”.
  - Getting Started/CLI Usage: namespaced examples; note prompt flag and PATH augmentation (already covered).
  - Init help: mention migration and .bak/--dry-run.

- Silent fallback audit (narrowed to config/migration scope)
  - Ensure debugFallback is used on: legacy engine extraction; legacy CLI loader fallback; DEFAULT_STAN_PATH resolution.
  - Tests assert no debug output unless STAN_DEBUG=1 (behavior unchanged otherwise).

- Test follow‑through
  - Add small parity checks for include‑on‑change on Windows/POSIX (core|path sources).
  - Consider a quick unit around top‑level index exports to guard against accidental re‑introduction of barrel‑of‑barrel.

---

## Backlog / follow‑through

- Snapshot UX follow‑through
  - Improve `snap info` formatting (clearer current index marking; optional time‑ago column).

- Live UI niceties (post‑stabilization)
  - Optional Output column truncation to available columns (avoid terminal wrapping when paths are long).
  - Optional alt‑screen mode (opt‑in; disabled by default).

- Docs/site
  - Expand troubleshooting for “system prompt not found” and PATH issues with suggestions (`--prompt core`, install missing devDeps, or invoke via package manager). (ongoing)

- Live view debugging (graceful)
  - Explore an approach to surface debug traces alongside the live table without corrupting its layout (e.g., a reserved log pane, a toggleable overlay, or a ring buffer dumped on finalize). Aim to preserve readability and avoid cursor/control sequence conflicts.

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
- Config swing:
  - stan init migrates legacy → namespaced; backup + dry-run supported. [PENDING]
  - Legacy engine keys honored via synthesized ContextConfig during transition; debugFallback notice only. [PENDING]
  - Deprecation phases implemented (env‑gated, then strict). [PENDING]
- Tests/docs:
  - Migration tests (YAML/JSON/mixed; idempotent; backups; dry-run). [PENDING]
  - Transitional extraction tests (legacy excludes/includes honored). [PENDING]
  - Docs updated (namespaced examples; migration appendix; init help). [PENDING]

---

## Completed (recent)

 - Tests — avoid package.json exports in fallback check
   - Removed reliance on resolving '@karmaniverous/stan-core/package.json' (may be excluded by exports). Assert the resolved path exists, ends with 'dist/stan.system.md', and is either under the temp fake base or under the installed node_modules/@karmaniverous/stan-core tree.

 - Tests — relax fallback strict equality to allow installed core path
   - Accept either the temp fake prompt path or the real installed `@karmaniverous/stan-core/dist/stan.system.md` path. Still asserts the path suffix and existence to validate the fallback logic. Unblocks the unit test across dev setups.

 - Tests — fix TS2741 in mocked createRequire.resolve and stabilize fallback path
   - Provide a proper NodeJS.RequireResolve (with `.paths`) in the mocked createRequire().resolve to satisfy TS/Typedoc; stabilizes fallback behavior on Windows paths with spaces.

 - Prompt resolver follow‑through — stabilize tests & TSDoc
   - Adjust fallback test to a minimal NodeJS.Require; remove the lone any; escape @ in TSDoc to satisfy tsdoc/syntax.

 - Run — plan-only prints resolved prompt
   - Updated `stan run -p` path to resolve the system prompt and include a `prompt:` line in the printed plan (core/local/path/auto). Falls back to the base plan if resolution fails.