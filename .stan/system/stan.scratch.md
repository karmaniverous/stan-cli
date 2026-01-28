# Scratch: TypeDoc warning + dependency-state exploration

## Current objective

- Fix TypeDoc warning without silencing validation by exporting/documenting the missing symbol(s) implicated by the warning.
- Use dependency graph mode correctly: stage the implicated modules via `.stan/context/dependency.state.json`, then re-run `stan run --context` to load authoritative file contents into the next archive.

## What’s staged (dependency.state.json)

- `src/index.ts`
- `src/runner/run/index.ts`
- `src/runner/run/types.ts`

## Coordination

- Posted an interop note to `stan-core` proposing a stricter packaged system-prompt rule: in `--context` mode, assistants must use `dependency.state.json` for exploration instead of requesting manual file pastes.