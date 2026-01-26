# Scratch: Add missing TypeDoc/TSDoc on public exports

## Current objective

- Add missing TypeDoc/TSDoc comments to exported symbols (functions/classes/types/interfaces/enums) at their declaration sites.
- Ignore barrel re-exports (document the original declarations, not the re-export lines).

## Approach

- Use dependency graph mode to stage the library entrypoint and its exported modules into the next archive via `.stan/context/dependency.state.json`.
- Run `npm run docs` (TypeDoc with `validation.notDocumented=true`) to surface any remaining “not documented” warnings and iterate until clean.
