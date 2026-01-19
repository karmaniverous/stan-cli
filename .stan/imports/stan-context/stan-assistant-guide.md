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
- The system **always chases** until reaching a “true defining file” (a module that defines the requested export locally, not merely forwarding it).

### External “commander rule”

For external entrypoints, tunneling is bounded:

- Follow re-exports only within the nearest `package.json` boundary of the external package.
- Do not tunnel across package boundaries (prevents pulling in unrelated transitive dependency packages).

## Common integration pitfalls

- Always persist and pass `previousGraph` if you want incremental behavior.
- If you rely on TS analysis, ensure `typescript` is installed in the consuming environment (peer dependency).
- Do not assume `node_modules/**` is in the Universe; it is implicitly excluded unless explicitly included (analysis may still discover external nodes via resolution).
