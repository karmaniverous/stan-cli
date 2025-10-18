# STAN Development Plan

## Next up (priority order)

## 10) Facet overlay (CLI owner)

Provide an optional, binary overlay that shrinks the full archive selection for steady threads while preserving a safe escape hatch to a complete baseline. The CLI owns overlay composition; the engine remains authoritative for selection semantics and reserved denials.

### Current status

- CLI flags are wired and active (renamed):
  - `-f/--facets [names...]` (overlay ON; naked = all active), `-F/--no-facets [names...]` (overlay ON with listed facets deactivated; naked = overlay OFF).
- Overlay composition implemented (`computeFacetOverlay`) and plumbed to the runner:
  - `excludesOverlay` merged into engine `excludes`.
  - `anchorsOverlay` passed to core (subject to reserved denials and binary screening).
- Plan shows a “Facet view” with overlay status, inactive/auto‑suspended facets, and anchors kept count.
- Docs metadata now persists overlay state to `.stan/system/.docs.meta.json`.

### Remaining work (near term)

- Tests:
  - Unit: overlay derivation (activate/deactivate precedence), anchors vs excludes precedence, ramp‑up safety auto‑suspend, facet view plan lines.
  - Integration: flag matrix (variadics + naked forms), metadata persisted, anchors honored by core, reserved denials never re‑included.

Files (included in archives; lives under `<stanPath>/system/`)

- `facet.meta.json` (durable, versioned in git): map of facet name to:
  - `exclude: string[]` — subtrees to drop when the facet is inactive and overlay is enabled.
  - `include: string[]` — “anchors” that must always be kept (e.g., docs indices, READMEs). Anchors re‑include even when excluded by `.gitignore` or repo/overlay excludes, subject to reserved denials and binary screening.
- `facet.state.json` (ephemeral, gitignored): map of facet name to boolean:
  - `true` = active (no drop),
  - `false` = inactive (drop its `exclude` globs when overlay is enabled),
  - facet missing in state ⇒ treated as active by default.

Flags (run only)

- `--facets` / `--no-facets` — enable/disable overlay.
- `-f [names...]` — overlay ON; set listed facets active for this run only. Naked `-f` ⇒ overlay ON; treat all facets active (no hiding).
- `-F [names...]` — overlay ON; set listed facets inactive for this run only. Naked `-F` ⇒ same as `--no-facets` (ignore overlay).
- If a facet appears in both `-f` and `-F`, `-f` wins (safer include).
- Defaults:
  - Built‑in default: overlay OFF.
  - `cliDefaults.run.facets: boolean` MAY set the overlay default; flags override.

Composition (CLI)

1. Determine inactive facets for the run (precedence: per‑run overrides > `facet.state.json` > default active).
2. Build overlay sets:
   - `excludesOverlay = ∪(exclude[] of all inactive facets)`,
   - `anchorsOverlay = ∪(include[] of all facets)` (always included).
3. Ramp‑up safety: if a facet is inactive but no anchor exists under its excluded subtree(s), **do not hide it** for this run (auto‑suspend the drop) and print a concise plan warning:
   - `stan: facet "<name>": no anchors found; kept code this run. Add an anchor in facet.meta.json include and re-run.`
4. Pass to engine alongside repo selection:
   - `includes: repo includes`,
   - `excludes: repo excludes ∪ excludesOverlay`,
   - `anchors: anchorsOverlay`.

Engine interaction and precedence (documented behavior)

- CLI passes `anchors` to:
  - `createArchive(cwd, stanPath, { includes?, excludes?, anchors? })`,
  - `createArchiveDiff({ ..., includes?, excludes?, anchors?, ... })`,
  - `writeArchiveSnapshot({ ..., includes?, excludes?, anchors? })`.
- Precedence:
  - `includes` override `.gitignore` (not `excludes`),
  - `excludes` override `includes`,
  - `anchors` override both `.gitignore` and `excludes`, subject to reserved denials:
    - `.git/**`, `<stanPath>/diff/**`, `<stanPath>/patch/**`,
    - `<stanPath>/output/{archive.tar,archive.diff.tar,archive.warnings.txt}`,
    - binary screening still applies.

Plan output (TTY/non‑TTY)

- When overlay is enabled, print a “Facet view” section:
  - overlay: on/off,
  - inactive facets and their excluded roots,
  - anchors kept (count or short list),
  - any auto‑suspended facets,
  - per‑run overrides in effect.

Overlay metadata (for assistants)

- Each run, augment `<stanPath>/system/.docs.meta.json` with:
  - `overlay.enabled: boolean`,
  - `overlay.activated: string[]`,
  - `overlay.deactivated: string[]`,
  - `overlay.effective: Record<string, boolean>`,
  - `overlay.autosuspended: string[]`,
  - `overlay.anchorsKept: Record<string, number>` (count‑per‑facet; avoid large metadata).
- Ensure metadata is included in both full and diff archives.

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
  - stan init migrates legacy → namespaced; backup + dry‑run supported. [DONE]
  - Legacy engine keys honored via synthesized ContextConfig during transition; debugFallback notice only. [DONE]
  - Deprecation phases implemented (env‑gated, then strict). [IN PROGRESS]
- Tests/docs:
  - Migration tests (YAML/JSON/mixed; idempotent; backups; dry‑run). [DONE]
  - Transitional extraction tests (legacy excludes/includes honored). [DONE]
  - Docs updated (namespaced examples; migration appendix; init help). [DONE]

---

## Completed (recent)

- Legacy config acceptance — Phase‑2 env gate
  - Implemented env gate for legacy shapes: loaders now require STAN_ACCEPT_LEGACY=1 (or “true”) to accept legacy config keys; otherwise they fail early with concise “run stan init” guidance.
  - Defaulted STAN_ACCEPT_LEGACY=1 in test setup to preserve transitional behavior; tests may override to assert failure paths.
  - Follow‑through: strict removal planned in Phase‑3.

- Tests — ensure env gate is effective during CLI construction
  - Set STAN_ACCEPT_LEGACY at module load time in src/test/setup.ts so Phase‑2 legacy acceptance is active even when CLI is constructed during test module import.
  - Removed the redundant set inside beforeEach.

- CLI — rename facet flags and align semantics/docs
  - Replaced `--facets/--no-facets` + `--facets-activate/--facets-deactivate` with:
    - `-f, --facets [names...]` (overlay ON; naked = all active)
    - `-F, --no-facets [names...]` (overlay ON with names deactivated; naked = overlay OFF)
  - Updated action logic and help/docs accordingly; cliDefaults.run.facets remains the overlay default.

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

- Facet overlay — scaffolding and plumbing
  - Added overlay reader/composer module (src/runner/overlay/facets.ts).
  - Added run flags: `--facets/--no-facets`, `-f/-F`, and `cliDefaults.run.facets` default.
  - Compute overlay before plan; pass `excludesOverlay` and `anchorsOverlay` to core via RunnerConfig; inject facet view in plan.
  - Extended docs metadata with `overlay.*` (enabled, overrides, effective, autosuspended, anchorsKept counts).

- Facet overlay — initial carve‑off
  - Added .stan/system/facet.meta.json and facet.state.json with facets: ci (.github/**), vscode (.vscode/**), docs (docs-src/\*\*). Each facet keeps a local anchor to satisfy ramp‑up safety. Defaults are inactive to reduce baseline archive size while preserving breadcrumbs.

- Facet overlay — major carve‑off
  - Added tests facet excluding '**/\*.test.ts', 'src/test/**', 'src/test-support/\*\*'; anchors keep a breadcrumb under each excluded root ('README.md', 'src/test/setup.ts', 'src/test-support/run.ts').
  - Added live-ui facet excluding 'src/anchored-writer/**', 'src/runner/run/live/**', 'src/runner/run/progress/**', 'src/runner/run/presentation/**', 'src/runner/run/ui/\*\*'; anchors keep each subtree’s barrel ('.../index.ts').

- Facet overlay — additional carve‑off
  - Added patch facet excluding 'src/runner/patch/\*\*' (anchor: 'src/runner/patch/service.ts').
  - Added snap facet excluding 'src/runner/snap/\*\*' (anchor: 'src/runner/snap/index.ts').
  - Added init facet excluding 'src/runner/init/\*\*' (anchor: 'src/runner/init/index.ts').

- Interop — facet‑aware editing guard (proposal to stan‑core)
  - Authored `.stan/interop/stan-core/20251018-000501Z-facet-aware-editing-guard.md` describing a system‑prompt change that requires enabling a facet before editing/creating files under it.
  - Identifies the system‑prompt sections that encouraged edits without facet gating (documentation cadence, always‑on checks, response format), and proposes a concrete guard/algorithm using `.docs.meta.json` `facet.meta.json`.
  - Optional enhancement: enrich `.docs.meta.json` with `overlay.facetRoots` to simplify assistant path‑to‑facet mapping.

- Facets — enable “tests” for next run
  - Activated the “tests” facet in `.stan/system/facet.state.json` to make test files visible.
  - Next turn: after `stan run -f tests`, add an integration test that asserts anchors never override reserved denials (`.git/**`, `.stan/diff/**`, `.stan/patch/**`) and wire it into the existing suites.

- Tests — anchors do not override reserved denials
  - Added integration test (src/runner/overlay/anchors.reserved.integration.test.ts) that anchors under `.stan/diff/**` and `.stan/patch/**` are ignored by selection, while normal anchors (e.g., README.md) are included.
  - Uses `writeArchiveSnapshot` (engine surface) to validate selection deterministically without relying on tar introspection; preserves CLI integration intent.
  - Confirms system‑documented reserved‑denials policy for `<stanPath>/diff` and `<stanPath>/patch` in a CLI integration test.
  - Note: `.git/**` behavior is pending upstream confirmation; track as a follow‑up interop item with stan‑core to ensure anchors never re‑include `.git/**` during snapshot/selection.

- Config hardening — overlay default locked
  - Confirmed `stan-cli.cliDefaults.run.facets: true` in `stan.config.*`, ensuring overlay is ON by default for this repository.
  - Flags still override defaults at run time; facet view appears in the plan when overlay is enabled.

- Init — ensure .gitignore includes system state/metadata files
  - Updated init workspace guard (`ensureStanGitignore`) to add `<stanPath>/system/facet.state.json` and `<stanPath>/system/.docs.meta.json` to `.gitignore`.
  - Added unit tests to assert new entries are written and that the function remains idempotent.