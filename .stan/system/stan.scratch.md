# Scratch: Bundle Fix

## Current Status
- `stan run` failed to resolve system prompt in global install because `stan-core` was bundled, breaking its asset resolution logic.
- Updated `rollup.config.ts` to externalize all production dependencies (including `stan-core`).
- This aligns with standard node-cli practices and fixes asset/singleton issues.
- Ready for release.
# Scratch: Runtime Fix

## Current Status
- Release candidate failed due to `__filename` reference in bundled `typescript`.
- Added `typescript` to external packages in Rollup config to prevent bundling.
- Ready to rebuild and release patch.
# Scratch: Docs Cleanup

## Current Status
- All tests passed.
- Addressing TypeDoc warnings for `DependencyContext` to ensure a clean release.
- Preparing for release.
# Scratch: Docs Alignment

## Current Status
- Updated documentation (`guides/`, `README.md`) to reflect the removal of `--meta` and the correct flags for combine (`-b`) and context (`-c`) modes.
- Added `archive.meta.tar` description to archives guide.
