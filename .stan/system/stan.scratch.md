# Scratch: Smoke test fix (modify main)

## Current objective

- Fix smoke test failure: `src/main.ts` was missing from DIFF because it was unchanged vs snapshot. Modify `src/main.ts` after snapping to force inclusion. Aggregate errors instead of throwing early.

## What’s staged
- `scripts/smoke-context-diff.ts`