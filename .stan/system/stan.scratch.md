# Scratch: Meta archive mislabeled as full; tighten context workflow

## Current objective

- Bug report: `stan run -Scm` (meta archive mode) shows live UI row `archive full` instead of `archive meta`.
- Process gap: assistant should prefer `dependency.meta.json` → `dependency.state.json` selection planning over web search or manual file-paste requests for in-repo code.

## Next step

- Stage the archive/progress/live-UI modules via `.stan/context/dependency.state.json`, then patch the CLI to emit/display the correct archive item label for meta mode.
