# Scratch: TypeDoc coverage for exported symbols

## Current focus

- Add missing TypeDoc/TSDoc comments to all exported symbols that TypeDoc validates (`typedoc.json` has `validation.notDocumented: true`).
- Ignore pure barrel re-exports (don’t add noise comments to `index.ts` files that only re-export).

## Exploration approach (dependency graph mode)

- Use `.stan/context/dependency.state.json` to stage the public entrypoint and its downstream modules into the next archive for editing.
- Start from `src/index.ts` and the key `src/runner/**` modules likely re-exported from the entrypoint; iterate based on TypeDoc’s “not documented” failures.

## Next step

- Re-run the archive with context mode enabled so `src/index.ts` + downstream dependencies appear in the next archive, then add missing TSDoc comments to the specific exported symbols TypeDoc flags.