# Scratch: Patch Recovery

## Current Status
- `src/cli/run/action/index.ts` failed to patch (context mismatch). Emitted Full Listing with the manual fix (removed `createMetaArchive` call).
- Updated `makeBaseConfigs` to propagate `behavior.meta` to the archive config.
- Updated `src/runner/run/session/archive-stage/index.ts` to pass `behavior` to `makeBaseConfigs`.
# Scratch: Meta Flag

## Current Status
- Implemented `--meta` option for `stan run`.
- Removes `archive.meta.tar` auto-creation.
- `stan run -c -m` creates `archive.tar` (meta) and skips diffs.
# Scratch: Meta Archive Config

## Current Status
- Updated `createMetaArchive` call in `src/cli/run/action/index.ts` to pass selection (includes/excludes) and combine status.
- This ensures `archive.meta.tar` respects user configuration and combine mode.
