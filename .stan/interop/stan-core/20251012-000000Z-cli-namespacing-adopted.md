# CLI namespacing adopted + transitional fallback (request to prune)

- What: stan-cli now ingests configuration from the top-level `stan-cli` section and provides a short transitional fallback for legacy engine keys (root -> synthesized ContextConfig) to keep the loop green during release sequencing.
- Why: Complete the namespacing swing and reduce ambiguity between engine and CLI responsibilities.
- Action:
  - Please prune resolved interop notes under `.stan/interop/stan-cli/*` that are specific to the config swing and loader export confirmations.
  - After pruning in stan-core, we will remove imports of core interop threads from stan-cli to keep archives lean.

Links/refs:
- Engine surfaces remain stable (`loadConfig*`, `createArchive*`, `writeArchiveSnapshot`, `prepareImports`, patch pipeline, prompt helpers).
- CLI now exposes `--dry-run` for `stan init` and added backup/idempotency tests.

Thanks — we’ll remove imports of stan-core interop threads from this repo after your prune completes to keep shared archives minimal.
