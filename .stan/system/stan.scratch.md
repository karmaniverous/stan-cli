# Scratch: DRY pass (phase 1) — config + archive-stage pipeline

## Current objective

- Start a targeted DRY refactor by first pulling the relevant modules into the chat context via `.stan/context/dependency.state.json`.
- Initial focus areas:
  - Archive-stage config assembly (where `makeBaseConfigs` currently lives/executes).
  - CLI config loading/parsing/defaults modules (`src/cli/config/*`, `src/common/config/parse.ts`).
- Keep the known context-mode bug in scope: base config assembly must not drop `dependency` context (diff archives must include dependency artifacts when context mode is active).

## Guardrails

- Prefer small extractions with stable names and co-located tests.
- Do not change behavior except where required to fix the context-mode archive bug.
- Avoid pulling large type-only dependency context unless needed; expand selection incrementally.