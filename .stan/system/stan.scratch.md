# Scratch: Fix dependency context diffs

## Recent fix

- Updated `src/cli/run/action/index.ts` to read `.stan/context/dependency.state.json` and pass it to the runner.
- This allows `stan-core` to use the explicit selection state for calculating diffs, ensuring newly selected dependency files appear in `archive.diff.tar`.
