# Context Mode: TypeScript Resolution Failure in stan-cli

- **Symptom**: `stan-cli` (v0.12.4+) fails to run `stan run -c` (context mode) with the error:
  `Error: dependency graph mode requires TypeScript; install "typescript" in this environment`
- **Environment**:
  - `stan-cli` has `typescript` (^5.9.3) and `@karmaniverous/stan-context` (^0.3.0) listed in `dependencies`.
  - `stan-core` is installed as a dependency (`^0.6.1`).
  - Node 20+, Windows (and likely others).
- **Location**: The error originates from `stan-core`'s bundled output (`dist/mjs/index-DEnUXENF.js`) during the dynamic import of typescript.

## Analysis
- Since `typescript` is present in the consumer's `node_modules` (stan-cli's), `stan-core` should be able to resolve it.
- The failure suggests that the dynamic import mechanism in the bundled `stan-core` might be resolving relative to the bundle location in a way that misses the hoisted/flattened dependency, or that the bundling process (tsup/esbuild/rollup) transformed the dynamic import in a way that breaks peer resolution.

## Request
- Please investigate `stan-core`'s dynamic import of `typescript` (and `stan-context`).
- Suggestion: Ensure the dynamic import uses a resolution strategy that finds peers in the consuming environment (e.g., trying `import(createRequire(process.cwd()).resolve('typescript'))` or similar fallback if standard `import()` fails).
- Verify that the build configuration for `stan-core` preserves the dynamic import correctly.

## Steps to Repro (in stan-cli)
1. `npm i` (ensure deps are present).
2. `npm run stan -- run -c` (or build and run dist).
