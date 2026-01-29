# Scratch: DRY refactor (CLI wiring)

- Objective: reduce duplication in CLI command registration, option wiring, and config loading.
- Context mode is active; iterate by updating `.stan/context/dependency.state.json` and re-running `stan run --context` to pull in focused modules before editing them.
- Keep `.stan/context/dependency.state.json` diffs small: minified JSON, avoid depth traversal unless we explicitly need closure.
- Current rule of thumb: depth=0 seeds only, so externals under `.stan/context/npm/**` are not pulled in via dependency closure.
- Focus areas:
  - `src/cli/**`: commander setup, run/snap/patch option wiring, config load/peek/raw.
  - `src/runner/run/session/archive-stage/**` + `src/runner/run/archive/**`: archive staging/orchestration.
- Next step: run `stan run --context` and attach `.stan/output/archive.tar` + `.stan/output/archive.diff.tar`; then implement “always pass `onSelectionReport` when building context archives” and use it to surface/guard against accidental external bloat.