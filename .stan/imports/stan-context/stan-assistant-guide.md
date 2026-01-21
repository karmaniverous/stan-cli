# STAN assistant guide — stan-context

This guide is a compact, self-contained usage contract for `@karmaniverous/stan-context` (“stan-context”). It is written so a STAN assistant (or human) can integrate the package correctly without consulting `.d.ts` files or other docs.

## What this package is (mental model)

`@karmaniverous/stan-context` is the **context compiler** for STAN:

- It scans a repository (“Universe”) and builds a deterministic dependency graph (“the Map”).
- The graph is consumed by higher-level tools (e.g., `stan-core`/`stan-cli`) to select the right files to read.

This package does **not**:

- create archives or diffs,
- manage `.stan/` state,
- apply patches,
- implement CLI/TTY behavior.

## Runtime requirements

- Node: `>= 20`
- TypeScript: optional **peer dependency** (`>= 5`)
  - If TypeScript is not installed, stan-context returns a nodes-only graph and includes a warning in `errors`.

## Public API

### `generateDependencyGraph(opts)`

Import:

```ts
import { generateDependencyGraph } from '@karmaniverous/stan-context';
```

Contract-level signature:

```ts
type GraphOptions = {
  cwd: string;
  config?: {
    includes?: string[];
    excludes?: string[];
    anchors?: string[];
  };
  previousGraph?: DependencyGraph;
  nodeDescriptionLimit?: number;
  nodeDescriptionTags?: string[];
  maxErrors?: number;
};

type GraphResult = {
  graph: DependencyGraph;
  stats: { modules: number; edges: number; dirty: number };
  errors: string[];
};

declare function generateDependencyGraph(
  opts: GraphOptions,
): Promise<GraphResult>;
```

Behavior:

- Always performs a Universe scan (gitignore + includes/excludes/anchors) and hashes discovered files.
- If TypeScript is available:
  - analyzes TS/JS module relationships and emits outgoing edges.
  - performs barrel “tunneling” for named/default imports (implicit edges).
- If TypeScript is missing:
  - returns a nodes-only graph (no outgoing edges) and sets `errors` accordingly.

Incremental usage:

- Pass `previousGraph` from your persisted state to reuse edges and limit analysis to a “dirty” set.

Runtime options:

- `nodeDescriptionLimit` (default: 160)
  - Produces `GraphNode.description` for TS/JS nodes based on a real `/** ... */` doc comment containing `@module` or `@packageDocumentation`.
  - Uses the prose portion only (tag text is ignored).
  - Normalizes to a single line; when truncated, keeps a strict prefix of exactly `nodeDescriptionLimit` characters and appends ASCII `...` (ellipsis not counted in the prefix).
  - Set to `0` to omit descriptions entirely.
- `nodeDescriptionTags` (default: `['@module', '@packageDocumentation']`)
  - Controls which TSDoc tags are considered for description extraction (TS/JS only).
  - Tags MUST include the `@` prefix and match `^@\w+$`.
- `maxErrors` (default: 50)
  - Caps the number of returned `errors` entries to avoid runaway output.
  - When truncation occurs, the final entry is a deterministic sentinel string.
  - Set to `0` to omit errors entirely.

## Authoring practices for STAN-enabled repos (recommended)

These conventions are not required for correctness, but they materially improve the quality and precision of the dependency graph (and therefore improve STAN’s context selection).

### Prefer named imports/exports over namespace patterns

- Prefer named/default imports when you want precise tunneling:
  - `import { Foo } from './barrel'`
  - `import Foo from './barrel'`

- Avoid namespace imports when you care about physical dependency precision:
  - `import * as Ns from './barrel'` does not tunnel by design.
  - It produces a coarser “depends on barrel” edge, which can cause broader context selection than necessary.

### Prefer direct re-exports on package/barrel surfaces

When hoisting internal modules to a package export surface (e.g., `index.ts`):

- Prefer direct re-exports:
  - `export { Foo } from './foo'`
  - `export type { Foo } from './foo'`

- “Import then export” forwarding is supported, but prefer direct re-exports for clarity and tooling-friendliness:
  - `import { Foo } from './foo'; export { Foo };`

- Namespace forwarding is supported but intentionally coarser:
  - `import * as Ns from './foo'; export { Ns };`
  - When consumers import `Ns`, stan-context treats it as a module-level dependency and tunnels only to the target module file (not to symbol-level declaration files). Prefer named exports when you want per-symbol precision.

### Write usable module/package doc prose (helps both graph + ESLint)

- Add real `/** ... */` doc comments with prose for module entrypoints and package documentation:
  - Use `@module` and/or `@packageDocumentation` and include a short prose summary in the same docblock.
  - Tag-only docblocks (no prose) are treated as unusable and will:
    - omit `GraphNode.description`, and
    - trigger `stan-context/require-module-description` warnings (if enabled).

### Use type-only syntax to improve edge classification

- Prefer `import type { T } from './x'` and `export type { T } from './x'` when the dependency is type-only. This improves the signal in `GraphEdge.kind`.

## Graph schema and invariants (high level)

The graph is deterministic and JSON-serializable:

- `graph.nodes` keys are sorted.
- `graph.edges` is a complete map: it contains a key for every node ID (empty array means “no outgoing edges”).
- Edges are de-duplicated by `(source, target, kind, resolution)` and sorted by `(target, kind, resolution)`.

### NodeId forms

Node IDs are stable strings:

- Repo-relative POSIX paths for in-repo files (e.g., `src/index.ts`)
- POSIX-normalized absolute paths when outside the repo root (e.g., `C:/x/y.d.ts`)
- Builtins: `node:fs`
- Missing/unresolved: the original specifier (e.g., `./nope`)

### Node kinds

- `source`: a file discovered by the Universe scan
- `external`: a resolved dependency file (commonly under `node_modules`)
- `builtin`: a Node.js builtin module (`node:<name>`)
- `missing`: an unresolved module specifier

### Node descriptions (TS/JS)

- `GraphNode.description` is optional.
- It is produced for TS/JS nodes (`source` and `external`) when a suitable doc comment is present and `nodeDescriptionLimit > 0`.
- It is omitted when no prose is found.

### Edge kinds and resolution

- `kind`: `runtime` | `type` | `dynamic`
- `resolution`: `explicit` | `implicit`

Interpretation:

- explicit edges represent direct imports/exports.
- implicit edges represent “tunneled” dependencies (barrels/re-exports), intended to capture the physical dependency on the defining module.

## TypeScript provider behavior (important)

Source extensions analyzed:

- `.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`

Resolution outcomes:

- builtins normalize to `node:<name>`
- missing specifiers create `missing` nodes
- external resolution follows physical paths (pnpm store paths are preserved)

### Barrel tunneling (re-exports)

To keep tunneling robust across TypeScript versions and `.d.ts` externals:

- Re-export barrels are treated as a _syntactic forwarding graph_.
- Tunneling through re-exports is **AST-first**:
  - named re-exports (`export { X } from './x'`, `export type { X } from './x'`) follow `moduleSpecifier` chains deterministically
  - star re-exports (`export * from './x'`) participate in tunneling as well
- Additional supported forwarding forms (also AST-first):
  - namespace re-exports (`export * as Ns from './x'`) are treated as module-level forwarding
  - “import then export” forwarding:
    - named (`import { A as B } from './x'; export { B as C }`)
    - default (`import Foo from './x'; export { Foo as Bar }`)
    - namespace (`import * as Ns from './x'; export { Ns as NamedNs }`)
- The system **always chases** until reaching a “true defining file” (a module that defines the requested export locally, not merely forwarding it).

Namespace forwarding note:

- When an exported name resolves to a forwarded namespace object, stan-context treats it as a module-level dependency and tunnels to the target module file only (no symbol-level declaration expansion).

### External “commander rule”

For external entrypoints, tunneling is bounded:

- Follow re-exports only within the nearest `package.json` boundary of the external package.
- Do not tunnel across package boundaries (prevents pulling in unrelated transitive dependency packages).

## ESLint plugin (optional)

stan-context publishes an ESLint plugin subpath export:

```ts
import stanContext from '@karmaniverous/stan-context/eslint';

export default [
  {
    plugins: { 'stan-context': stanContext },
    rules: {
      // Equivalent to enabling the rule directly:
      // 'stan-context/require-module-description': 'warn',
      ...stanContext.configs.recommended.rules,
    },
  },
];
```

The rule shares the same “usable prose” semantics as `GraphNode.description`.

## Common integration pitfalls

- Always persist and pass `previousGraph` if you want incremental behavior.
- If you rely on TS analysis, ensure `typescript` is installed in the consuming environment (peer dependency).
- Do not assume `node_modules/**` is in the Universe; it is implicitly excluded unless explicitly included (analysis may still discover external nodes via resolution).
- If you want precise tunneling through barrels, avoid patterns that obscure the symbol-level dependency (especially namespace imports/exports). Prefer direct named re-exports and named imports to help stan-context produce the most actionable graph.
