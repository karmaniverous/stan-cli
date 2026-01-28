# Scratch: Interop to prevent load-before-edit failures in context mode

## Current objective

- Post an interop note to `stan-core` explaining a failure mode: the assistant drafted patches for repo files whose contents were not loaded via archive/staged selection.
- Propose prompt-level guardrails that mechanically force the correct first step in dependency graph mode:
  - require a “target availability checklist” before patches, and
  - require a “stop-and-stage” branch that only patches `dependency.state.json` + scratch/todo when any target file is missing.

## Next step

- After `stan-core` incorporates the gate, apply the same behavior consistently in `stan-cli` threads to avoid speculative patches.