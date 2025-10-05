# Question — knip‑unused engine helpers (move to CLI or delete?)

Context

- stan-core currently ignores the following helpers in knip to keep the engine clean while we decide whether CLI needs them.

Candidates

- src/test/helpers.ts — test utility; engine-only tests. Likely keep or delete (not a CLI concern).
- src/stan/patch/context.ts — resolves <stanPath>/patch/.patch path; if CLI wants a helper for this, propose move to stan-cli.
- src/stan/patch/detect.ts — simple seemsUnifiedDiff; could be a CLI preflight checker for clipboard/arg inputs.
- src/stan/patch/git-status.ts — intentional no-op; safe to delete unless CLI plans to warn on staged overlap (policy currently “no warn”).
- src/stan/patch/headers.ts — pathsFromPatch (extracts target paths from a diff); useful for editor-open decisions after patch apply.
- src/stan/patch/util/fs.ts — ensureParentDir wrapper around fs-extra; redundant (call ensureDir directly).

Proposal

- For CLI use: context.ts, detect.ts, headers.ts (optional). We can relocate these into stan-cli under a small adapter/util namespace.
- For deletion: git-status.ts (no-op), util/fs.ts (redundant), and test/helpers.ts (engine test-only).

Action requested (please reply)

- For each file, reply yes/no (move vs delete):
  - patch/context.ts — move?
  - patch/detect.ts — move?
  - patch/headers.ts — move?
  - patch/git-status.ts — delete?
  - patch/util/fs.ts — delete?
  - test/helpers.ts — keep/delete?

Notes

- We added a temporary knip ignore in stan-core. Once you confirm, we’ll either move the needed ones to stan-cli (and remove ignore) or delete them from stan-core and drop the ignores.
