# Scratch: TypeDoc coverage for exported symbols

## Current focus

- Ensure exported (non-barrel) symbols have proper TSDoc/TypeDoc comments to satisfy `typedoc.json` validation (`notDocumented: true`).

## Work completed in this turn

- Added module docblocks (`@module`) and documented default exports in `eslint.config.ts` and `vitest.config.ts`.
- Documented exported build helpers and default config in `rollup.config.ts` (`buildLibrary`, `buildCli`, `buildTypes`, `default`).

## Follow-ups

- If TypeDoc still reports undocumented exports, load the affected `src/**` modules in-thread and add TSDoc to their exported API (ignoring pure barrel re-exports).
