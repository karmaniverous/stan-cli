# Scratch: DRY refactor (CLI wiring)

- Objective: reduce duplication in CLI command registration, option wiring, and config loading.
- Context mode is active; iterate by updating `.stan/context/dependency.state.json` and re-running `stan run --context` to pull in focused modules before editing them.
- Focus areas:
  - `src/cli/**`: commander setup, run/snap/patch option wiring, config load/peek/raw.
  - `src/runner/run/session/archive-stage/**` + `src/runner/run/archive/**`: archive staging/orchestration.
- Next step: run `stan run --context` and attach `.stan/output/archive.tar` + `.stan/output/archive.diff.tar` so we can refactor without guessing.