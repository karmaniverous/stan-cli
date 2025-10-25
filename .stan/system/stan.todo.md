# STAN Development Plan

## Next up (priority order)

- Phase‑3: remove legacy acceptance (drop STAN_ACCEPT_LEGACY gate; require namespaced config).
- Docs: expand troubleshooting for system prompt resolution and PATH augmentation.
- Snap UX: improve “snap info” formatting (clearer current index; optional time‑ago).

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

- Facets — enable “tests” and “live-ui” for next run
  - Enabled the “tests” facet so unit/integration tests and helpers are visible when overlay is on.
  - Enabled the “live-ui” facet to allow edits in src/runner/run/live/\*\*, progress sinks, and UI barrels if needed.
  - Next turn: refresh baseline with the facets active:
    - Run: `stan run -f tests live-ui` (overlay ON; listed facets forced active) or simply rerun with overlay enabled (defaults) since state now marks both as active.
  - Follow‑through (after refresh):
    - Fix TS type in src/cli/header.test.ts (spyOn mock type mismatch).
    - Stabilize child_process mocking in snap tests (ensure named export `spawn` is mocked for ESM).
    - Fix node:module mock to include a default export when partially mocking (resolveCorePromptPath fallback).
    - Address UI parity test SyntaxError (likely stray token in test or import).
    - Re‑run full suite and rebuild; iterate as needed.

- Facets — enable “snap” for next run
  - Enabled the “snap” facet so code under src/runner/snap/\*\* is visible while overlay is on.
  - Next turn: refresh baseline with the facet active:
    - Run: `stan run -f snap` (overlay ON; facet forced active), or proceed with overlay enabled (defaults) since state now marks “snap” active.
  - Follow‑through (after refresh):
    - Fix child_process mocking path in snap tests so `spawn` is a function when imported from 'node:child_process'.
    - Re‑run tests to confirm stash‑failure handling passes without touching archives.

- Facets — enable “patch” for next run
  - Enabled the “patch” facet so code under src/runner/patch/\*\* is visible while overlay is on.
  - Next turn: refresh baseline:
    - Run: `stan run -f patch` (overlay ON; facet forced active), or proceed with overlay enabled (defaults) since state now marks “patch” active.
  - Follow‑through: add BORING‑aware status helpers (statusOk/statusFail) for patch logging and re‑run tests; this addresses the remaining failure in src/cli/patch.fileops-only.test.ts.

- Live UI — fix parser‑sensitive brace/comment boundary in LiveSink
  - Moved the trailing comment for flushNow() onto its own line after the closing brace of stop() to avoid any parser edge cases that could lead to a SyntaxError in the live.order.flush test.
  - Next: re‑run tests to confirm the live.order.flush suite passes cleanly.
  - If the error persists, expand the stack capture (STAN_LIVE_DEBUG=1) and inspect the compiled JS for the exact token location.

- Build UX — harden warnPattern to ignore allowed Rollup warnings
  - Updated stan.config.yml so the build script’s warnPattern:
    - ignores @rollup/plugin-typescript’s “outputToFilesystem option is defaulting to true” warning, and
    - ignores circular dependency lines from node_modules/zod/\*\*, while still flagging other “(!) …” warnings.
  - Result: clean runs don’t surface [WARN] when only these benign lines appear.
