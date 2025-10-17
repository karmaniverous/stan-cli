# STAN Development Plan

## Next up (priority order)

## 10) Facet overlay (CLI owner)

Provide an optional, binary overlay that shrinks the full archive selection for steady threads while preserving a safe escape hatch to a complete baseline. The CLI owns overlay composition; the engine remains authoritative for selection semantics and reserved denials.

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

Testing (representative)

- Flags: `--facets/--no-facets`, `-f/-F` (variadics and naked forms), conflict resolution (`-f` wins).
- Overlay composition and ramp‑up safety.
- Anchors propagate to engine; reserved denials never overridden by anchors.
- Overlay metadata written and present in archives.
- Plan shows “Facet view” accurately.

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

- Facet overlay — scaffolding and plumbing
  - Added overlay reader/composer module (src/runner/overlay/facets.ts).
  - Added run flags: `--facets/--no-facets`, `-f/-F`, and `cliDefaults.run.facets` default.
  - Compute overlay before plan; pass `excludesOverlay` and `anchorsOverlay` to core via RunnerConfig; inject facet view in plan.
  - Extended docs metadata with `overlay.*` (enabled, overrides, effective, autosuspended, anchorsKept counts).
