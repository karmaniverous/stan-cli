# Scratch: Meta archive labeling in run UI

## Current objective

- Fix `stan run -Scm` meta mode so the live UI shows:
  - Type: `archive`
  - Item: `meta`
- Ensure non-TTY logger output prints `archive (meta)` (e.g., `stan: [RUN] "archive (meta)"`).

## Next step

- Treat archive variant as an explicit value (full|diff|meta) derived from the operation/behavior, not from the output filename (`archive.tar`).
- Extend `ArchiveKind` to include `meta`; queue `meta` (and skip diff) when `behavior.meta` is enabled.