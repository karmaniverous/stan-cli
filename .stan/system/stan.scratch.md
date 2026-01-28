# Scratch: Fix smoke test (ESM __dirname)

## Current objective

- Fix `scripts/smoke-context-diff.ts` to use `import.meta.url` instead of `__dirname` (ESM compatibility).

## What’s staged
- `scripts/smoke-context-diff.ts`