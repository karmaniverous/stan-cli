# Scratch: Robust smoke test (deps)

## Current objective

- Verify `scripts/smoke-context-diff.ts` correctly handles external dependencies: `my-dep` (imported) should be staged/archived, `unused-dep` should not. `src/ignored.ts` remains as base selection.

## What’s staged
- `scripts/smoke-context-diff.ts`