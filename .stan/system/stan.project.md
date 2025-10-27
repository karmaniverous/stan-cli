# Project‑Specific Augmentations — Multi‑Repo Coordination and Engine/CLI Boundaries

This document augments the system prompt with repo‑specific guidance for developing stan-core (engine) and stan-cli (CLI/runner) together using a published STAN baseline. It contains only instructions to the assistant. It is not a repository for project requirements or the dev plan.

The goals:

- Keep engine/CLI responsibilities clean: the CLI acquires/presents; the core decides/processes.
- Make multi‑repo context predictable and safe when archives ingest imports from other STAN instances.
- Provide a lightweight, deterministic interop channel for cross‑repo coordination (multi‑file, aggressively pruned).

---

## Module decomposition policy (directory + index.ts barrel)

When decomposing a file named `X.ts`:

- Create a directory `X/` and place the decomposed modules inside it.
- Add `X/index.ts` that re‑exports the public surface for the module (barrel).
- Delete the original `X.ts`.
- Preserve import stability: existing imports such as `import {...} from './X'` must continue to resolve (to `./X/index.ts`).

This convention keeps module boundaries clear, avoids duplicate barrels (file and folder), and makes refactors predictable. Apply this consistently for new decompositions and when regularizing legacy ones.

## SSR/ESM test‑stability playbook (Vitest Option 1)

When tests run under Vitest SSR and worker forks, import‑time evaluation order and export shape can differ from Node runtime. Use this playbook to keep tests deterministic without changing runtime behavior:

- Evaluation‑time hazards and cures
  - Hoist fragile exports: prefer exported function declarations over `export const fn = (...) => ...` for helpers that other modules resolve dynamically (prevents “X is not a function” under SSR).
  - Resolve at call‑time, not at module‑eval time:
    - Use dynamic `await import(...)` inside the action/phase that needs the function.
    - Pick functions via a “named‑or‑default” resolver:
      - prefer `mod.named`, fall back to `mod.default.named`, and finally to `mod.default` when it is a callable function.
  - Keep a minimal fallback when a peer cannot be resolved in tests (never in normal runtime), e.g.:
    - run help defaults: fall back to a fully shaped baseline `{ ...RUN_BASE_DEFAULTS, plan: true, prompt: 'auto', facets: false }`.
    - snap defaults: when CLI defaults are unreadable, parse stan.config.\* directly (namespaced first, legacy root fallback) and map only the needed fields.

- CLI parse normalization is idempotent
  - Always install both parse normalizers on root and subcommands, even as a fallback:
    - `patchParseMethods()` (normalize argv like `['node','stan',...]` → `[...]`),
    - `installExitOverride()` (swallow benign Commander exits).
  - Doing this twice is safe and prevents “unknown command 'node'” in tests.

- Known guardrails to keep
  - Run help defaults: ensure fallback uses the fully shaped object `{ ...RUN_BASE_DEFAULTS, plan: true, prompt: 'auto', facets: false }`.
  - Optional helpers like `tagDefault(...)` must be behind `?.` (avoid throwing in help/SSR paths).
  - Live/hang thresholds: keep numeric baselines (hangWarn 120, hangKill 300, hangKillGrace 10).
  - Prompt and overlay: default `prompt: 'auto'`; overlay default off unless explicitly enabled.

- Action‑time lazy resolution (patterns)
  - CLI “run”:
    - Resolve `resolveEffectiveEngineConfig` dynamically (named‑or‑default).
    - Resolve CLI config dynamically; if not available, read scripts and `cliDefaults.run.scripts` by parsing stan.config.\* directly (prefer `stan-cli` namespaced; fall back to legacy root).
  - Snap:
    - Resolve handlers (`handleSnap|Undo|Redo|Set|Info`) dynamically (named‑or‑default).
    - For `cliDefaults.snap.stash`, accept legacy by temporarily enabling `STAN_ACCEPT_LEGACY`; if that fails, parse stan.config.\* directly (namespaced, then legacy).
  - Archive stage:
    - Resolve `archivePhase` and `stageImports` at call time (named‑or‑default) to avoid import‑time races.

## 1) Multi‑instance imports and disambiguation (authoritative vs contextual)

- You may see multiple files named “stan.requirements.md” and “stan.todo.md” in a single archive (local + imported copies from other STAN repos).
- Treat the local documents as the only authoritative targets for updates:
  - Local requirements: `<stanPath>/system/stan.requirements.md`
  - Local dev plan: `<stanPath>/system/stan.todo.md`
- Treat imported documents as read‑only context:
  - Imported content lives under: `.stan/imports/<label>/...`
  - Never create, patch, or delete files under `.stan/imports/**`. Do not propose edits to imported requirements/todo; use them only to inform decisions.
- When referencing a document, always disambiguate by explicit path. If you refer to an imported requirements/todo, include its `<label>` and the full repo‑relative path under `.stan/imports/<label>/...`.
- When proposing changes to requirements or the dev plan, target only the local files under `<stanPath>/system/`.

---

## 2) Interop threads — multi‑file messages (no front matter; aggressive pruning)

Use interop messages to coordinate cross‑repo actions (CLI ↔ Core). Messages are plain Markdown files; one file per message for small diffs and deterministic order.

- Locations
  - Outgoing (authored locally): `.stan/interop/<label>/*.md`
    - `<label>` is the operational slug the peer uses as its import label (e.g., “core-interop”, “cli-interop”).
  - Incoming (staged via imports): `.stan/imports/<label>/*.md`
    - These are read‑only; consume them before proposing cross‑repo work.

- Filename convention (ordering by name)
  - `<UTC>-<slug>.md`
    - `<UTC>`: `YYYYMMDD-HHMMSSZ` (UTC, so lexicographic sort = chronological order).
    - `<slug>`: short, url‑safe, lower‑case (e.g., `api-surface`, `clipboard-boundary`, `swappable-core`).

- Message body
  - Plain Markdown; optional initial heading; then short bullets explaining:
    - What/Why/Action items, and links/refs if helpful.
  - Keep each message atomic and self‑contained.

- Assistant obligations
  - Always scan incoming interop messages first (sorted lexicographically by filename) and incorporate them before proposing cross‑repo work.
  - When a change here implies a concrete action in the peer repo, propose creating a new outgoing interop message file under `.stan/interop/<label>/` using the filename convention and a concise body.
  - Append‑only behavior: never rewrite prior messages; post a new file for updates.
  - Aggressive pruning: as soon as an interop exchange is resolved and the conclusions are reflected in the local requirements/dev plan, propose File Ops to remove the now‑stale interop message file(s). Do not rotate; threads are intentionally short and ephemeral.

- File Ops examples (for pruning)
  - Propose:
    ```
    ### File Ops
    rm .stan/interop/<label>/20251001-170512Z-api-surface.md
    ```
  - Never propose File Ops that touch `.stan/imports/**`.

---

## 3) Imports bridge — linking peer docs/types/messages for context

- Ensure imports in `stan.config.*` stage high‑signal peer artifacts into this repo’s `.stan/imports/<label>/...` before archiving. Typical labels:
  - In stan-cli:
    - `core-docs`: `../stan-core/.stan/system/stan.requirements.md`, `../stan-core/.stan/system/stan.todo.md`
    - `core-types`: `../stan-core/dist/index.d.ts`
    - `core-interop`: `../stan-core/.stan/interop/stan-cli/*.md`
  - In stan-core:
    - `cli-docs`: `../stan-cli/.stan/system/stan.requirements.md`, `../stan-cli/.stan/system/stan.todo.md`
    - `cli-interop`: `../stan-cli/.stan/interop/stan-core/*.md`
- If the imports mapping is missing or incomplete and the change at hand benefits from those artifacts, propose a precise patch to `stan.config.*` that adds only the minimal patterns needed. Do not propose broad globs. Avoid adding imports solely for convenience if they create large or noisy archives.

---

## 4) Engine/CLI boundaries — acquisition vs processing (behavioral guardrails)

- CLI responsibilities (adapters; presentation):
  - Acquire inputs (arguments, files, clipboard) and pass data to the engine as plain strings and structured options.
  - Present outputs (warnings, statuses, diagnostics envelopes); open editors; handle TTY/live UI and cancellation.
  - When cross‑repo actions are needed, create/maintain outgoing interop messages under `.stan/interop/<label>/...` and aggressively prune resolved items.

- Core responsibilities (engine; processing):
  - Accept patch input as strings (engine does not acquire from clipboard).
  - Decide and process: selection/archiving/diffing/snapshot/patch pipeline/file ops/validation.
  - No console I/O from core; surface warnings/notes via return values or optional callbacks to the caller (CLI).
  - Provide prompt utilities (`getPackagedSystemPromptPath`, `assembleSystemMonolith`) as quiet, pure helpers; the CLI chooses if/how to invoke them.

- Assistant guardrails
  - Do not propose introducing clipboard/editor/TTY dependencies into the engine.
  - When proposing refactors or new behavior, keep the engine pure and push acquisition/presentation concerns into the CLI adapters.
  - If a change spans both repos, use interop messages to coordinate; do not attempt to drive both sides in a single monolithic patch unless requested.

---

## 5) Swappable core awareness (runtime selection by CLI)

- The CLI may run against an alternate or in‑development engine via a `--core` option. You should:
  - Avoid assumptions about the engine’s physical location or build flavor (dist vs source); reason about behavior solely through the documented public API.
  - When asked to assist with loader or integration changes, generate small, testable adapter logic on the CLI side (e.g., path resolution, version/shape checks, banner print), and keep the engine API stable and presentation‑free.

---

## 6) Document cadence and commit behavior (unchanged)

- If you emit any code Patch blocks for this repo, you MUST also update the local dev plan under `<stanPath>/system/stan.todo.md` (unless the change set is deletions‑only or explicitly plan‑only) and end with a proper Commit Message block as defined in the system prompt.
- Never propose changes to imported documents (`.stan/imports/**`). Imported content is context only.

---
