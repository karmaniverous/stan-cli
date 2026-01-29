# Scratch: Stage DRY Hotspots

## Current objective

- Fix `archivePhase` type errors and align `smoke-context-diff` expectations with Context Mode Option B (unselected files excluded).
- Stage DRY hotspots (archive-stage + CLI config modules) into the thread context via `dependency.state.json`.
- Prepare for refactor to reduce duplication in CLI command registration, option wiring, and config loaders.