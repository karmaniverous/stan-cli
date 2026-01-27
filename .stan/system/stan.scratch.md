# Scratch: DRY refactor pass (stan-cli)

## Current objective

- Implement refined `stan run` archive composition rules based on context modes:
  - Default: no dependency artifacts.
  - Meta (`-c -m`): reset state to `[]`, include state in `archive.tar`, skip `archive.diff.tar`.
  - Context (`-c`): skip `archive.tar`, write `archive.diff.tar` with selected context.

## Immediate next step

- Verify archive contents manually or via test if possible (manual verification in next step).
- Resume previous plan: DRY refactor pass (shared Commander plumbing).

## Constraints / guardrails

- Prefer small new helper modules over growing existing “god” helpers; co-locate tests for new non-trivial helpers.
- Dependency graph mode is active; use `.stan/context/dependency.state.json` to stage specific modules for analysis/refactor when needed.
