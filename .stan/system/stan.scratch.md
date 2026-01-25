# Scratch: Dependency Context v2 Fix

## Current Status
- Updated `stan-cli` to align with `stan-core` v2 dependency context model (`map` + `meta` split).
- Replaced `sources` with `map` in types and action flow.
- Added `writeDependencyMapFile` call.
# Scratch: System Prompt Gap

## Current Status

- Identified root cause of `stan run -c` failure: `stan-core` requires host injection of `typescript`.
- Implemented injection in `src/cli/run/action/index.ts`.

## Next Steps

- Verify docs build.
- Release prep (changelog/versioning).
