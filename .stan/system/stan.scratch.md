# Scratch: Fix context mode archiving (dependency prop loss)

## Current objective

- Fix bug where `stan run -c` produces diff archives missing both the dependency state file and the files selected by it.
- Cause: `makeBaseConfigs` in the archive stage drops the `dependency` object and fails to force-include gitignored dependency artifacts.

## Constraints / guardrails

- Ensure `dependency` context is propagated to `archivePhase`.
- Ensure `dependency.state.json` and `dependency.meta.json` are explicitly included in selection when `context` mode is active (so they appear in diffs despite being gitignored).
