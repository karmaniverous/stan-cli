# Scratch: Fix smoke test (gitignore)

## Current objective

- Fix `scripts/smoke-context-diff.ts` failure where `src/ignored.ts` was unexpectedly included. Add `.gitignore` to exclude sources by default, verifying that `dependency.state.json` selection overrides gitignore for `src/main.ts`.

## What’s staged
- `scripts/smoke-context-diff.ts`