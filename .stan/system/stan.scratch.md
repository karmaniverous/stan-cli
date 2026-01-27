# Scratch: DRY refactor pass (stan-cli)

## Current objective

- Fix typing/export errors from DRY refactor:
  - Rename `rootDefaults` to `readRootDefaultsFromConfig` in `src/cli/config/defaults.ts` to match `index.ts` import.
  - Fix TSDoc syntax in `src/cli/lib/commander.ts`.

## Immediate next step

- Verify refactor integrity (run tests).
- Continue DRY pass: identify next target (e.g., named-or-default resolution pattern).

## Constraints / guardrails

- Prefer small new helper modules over growing existing “god” helpers; co-locate tests for new non-trivial helpers.
- Dependency graph mode is active; use `.stan/context/dependency.state.json` to stage specific modules for analysis/refactor when needed.
