# Scratch: Fix context selection smoke test (archive.tar missing)

## Current objective

- Fix `src/test/smoke/archive-context-selection.test.ts` failure where `stan run -Sc` exits without producing `.stan/output/archive.tar` (FULL).

## Working hypothesis

- CLI-side dependency-map filtering is using the wrong coordinate system: it was filtering the host-private dependency map using an allowlist of *archive file paths* (which may be staged `.stan/context/...` paths), but the map is keyed by *graph node IDs* (e.g., `node_modules/<pkg>/...`), causing context archiving to fail and skip writing FULL.

## Current fix direction

- Compute the selected nodeId closure directly from dependency meta (v2) + dependency state (v2), then filter the dependency map to those nodeIds before archiving (so staging cannot “accidentally stage everything”, but also cannot drop required nodes due to path mismatch).
