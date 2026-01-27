# Scratch: DRY refactor pass (stan-cli)

## Current objective

- Execute "one high-leverage DRY extraction": centralize shared Commander setup (`cli-utils.ts` junk drawer).
- Split `cli-utils.ts` into:
  - `src/cli/lib/commander.ts` (safety + helpers)
  - `src/cli/config/defaults.ts` (root/run/snap defaults derivation)
  - `src/cli/util/collection.ts` (data helpers)

## Immediate next step

- Verify refactor integrity (run tests).
- Continue DRY pass: identify next target (e.g., named-or-default resolution pattern).

## Constraints / guardrails

- Prefer small new helper modules over growing existing “god” helpers; co-locate tests for new non-trivial helpers.
- Dependency graph mode is active; use `.stan/context/dependency.state.json` to stage specific modules for analysis/refactor when needed.
