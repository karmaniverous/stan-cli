# Scratch: DRY refactor pass (stan-cli)

## Current objective

- DRY up the codebase without changing behavior: reduce duplication across CLI command registration, option wiring, config loading, and shared run/snap/patch workflows.
- Keep module SRP strong and obey the 300-LOC hard gate (decompose before expanding long files).

## Immediate next step

- Generate a long-file list (`wc -l src/**/*.ts`) and pick 1–2 top targets (highest duplication + highest churn) for the first DRY extraction.
- Start with shared Commander plumbing (parse normalization + exit override + common global flags), then apply it across subcommands.

## Constraints / guardrails

- Prefer small new helper modules over growing existing “god” helpers; co-locate tests for new non-trivial helpers.
- Dependency graph mode is active; use `.stan/context/dependency.state.json` to stage specific modules for analysis/refactor when needed.
