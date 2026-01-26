# Scratch: Dependency Graph Mode Trigger (Thread-Sticky)

## Current focus
- Diagnose a failure mode where dependency graph mode becomes “invisible” on diff-only turns (because `.stan/context/dependency.meta.json` is unchanged and therefore omitted from `archive.diff.tar`).

## Work completed in this turn
- Wrote a stan-core interop note proposing a thread-sticky activation rule (once dependency meta is seen anywhere in a thread, keep updating `.stan/context/dependency.state.json`).

## Follow-ups
- Decide whether to encode this as baseline assistant guidance and/or a tooling behavior (always include dependency meta/state in context-mode archives).