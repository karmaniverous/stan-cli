# Scratch: System Prompt Gap

## Current Status

- Identified root cause of `stan run -c` failure: `stan-core` requires host injection of `typescript`.
- Implemented injection in `src/cli/run/action/index.ts`.

## Next Steps

- Verify docs build.
- Release prep (changelog/versioning).
