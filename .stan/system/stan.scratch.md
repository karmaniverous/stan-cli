# Scratch: Fix smoke test (stale graph)

## Current objective

- Fix `scripts/smoke-context-diff.ts` failure where `src/main.ts` was missing from archives. Ensure source files are created *before* the initial `stan run -Scm` so the dependency graph includes them.

## What’s staged
- `scripts/smoke-context-diff.ts`