# Documentation Alignment (Meta Archive)

We have updated `stan-cli` documentation to reflect the final `-m` design:

- `archive.meta.tar` is NOT produced.
- `stan run -c` produces standard full/diff archives (enriched with context).
- `stan run -c -m` produces `archive.tar` as the meta archive and skips diff generation.
- The Assistant Guide and CLI Examples now accurately describe this behavior.
