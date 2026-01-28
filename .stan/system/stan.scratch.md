# Scratch: Context archives (FULL/DIFF/META) interop alignment

## Current objective
- Align stan-cli archive outputs with the latest stan-core interop contract for context mode:
  - `stan run`: FULL + DIFF, and BOTH must exclude dependency meta/state.
  - `stan run --context`: FULL + DIFF (Option B), where DIFF is computed against the FULL selection universe for context mode.
  - `stan run --context --meta`: META-only `archive.tar` (no diff), includes normal base selection + dependency meta/state, and resets dependency.state.json to empty v2 before archiving (semantic JSON only).

## Key decisions (A–D)
- Snapshot naming: keep existing non-context baseline; context uses `.archive.snapshot.context.json`.
- `stan snap`: update BOTH non-context and context baselines when dependency context artifacts are present/applicable.
- Meta archive includes the normal base selection (not minimal).
- Empty dependency.state.json formatting is semantic-only (no byte pinning).

## Next step
- Implement the above in run archive stage + archive phase wiring (snapshotFileName), update snap to write both baselines, then lock behavior with smoke tests.