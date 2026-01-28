# Scratch: Context staging must respect state depth

## Current objective

- Fix `stan run --context` so external dependency payloads are only staged/archived when selected by `dependency.state.json` closure (depth defaults to 0).
- Remove eager staging of the entire dependency graph; rely on stan-core dependency-context archiving to stage selected externals and clean stale payloads.
- Update smoke harnesses so they explicitly request depth=1 when they intend to include runtime deps, and do not expect unchanged base-selection files in `archive.diff.tar`.

## What’s staged
- `src/cli/run/action/index.ts`
- `src/test/smoke/archive-context.test.ts`
- `scripts/smoke-context-diff.ts`