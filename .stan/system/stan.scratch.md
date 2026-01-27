# Scratch: DRY refactor pass (stan-cli)

## Current objective

- Start DRY pass by consolidating repeated “named-or-default” module resolution patterns (SSR/Vitest-safe) and any duplicated config fallback/default merging logic in CLI/run/snap paths.

## Immediate next step

- Run `stan run --context` and attach the resulting `.stan/output/archive.diff.tar` so the staged modules (from `.stan/context/dependency.state.json`) are available for refactor.
- After review of staged modules, extract a single small resolver helper (pure, no IO) + unit tests, then update call sites in one cohesive change set.

## Constraints / guardrails

- No long-file decompositions required yet (all modules are <300 LOC), but keep changes cohesive and avoid creating new “god helpers”.
- Keep CLI as adapter: acquisition/presentation stays in CLI; resolution helper remains pure and reusable.
- Dependency graph mode is active: update `.stan/context/dependency.state.json` deliberately to control context size.
