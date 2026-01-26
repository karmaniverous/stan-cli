# Scratch: UI Fix for Meta Mode

## Current Status
- Fixed `stan run --context --meta` showing a pending "archive (diff)" row in the live UI.
- Updated `ui-queue` and `orchestrator` to skip queueing the diff row when `behavior.meta` is true.
- Execution side was already correct (skipping diff generation).
