# Scratch: Snap test robustness

## Current objective

- Proceed with the DRY refactor (CLI internals) now that context archive composition and snapshot keying are stable.## State
- Context mode (Option B): `stan run --context` now produces `archive.tar` (FULL) and `archive.diff.tar` (DIFF).
- Snapshots: `stan snap` updates both `.archive.snapshot.json` and `.archive.snapshot.context.json` when applicable.
- Config: `makeBaseConfigs` handles dependency context propagation.

## Next step

- Identify DRY hotspots (command registration, config loading, run defaults) and begin extraction.
- Refactored `snap.overlay.snapshot.test.ts` to use `vi.mock` (hoisted) instead of `vi.doMock` to guarantee mock application before static imports.
