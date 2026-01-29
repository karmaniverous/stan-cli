# Scratch: Implement Context Mode Option B via Engine Orchestration

## Current objective

- Refactor `stan-cli` to use the new `stan-core` context orchestration helpers (`createContextArchive...`).
- Fix `archive-context-selection` smoke test by ensuring FULL archives respect the allowlist closure (excluding unselected repo files).
- Delete redundant CLI-side dependency filtering logic.
