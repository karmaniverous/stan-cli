# Always‑on prompt checks (assistant loop)

On every turn, perform these checks and act accordingly:

- System behavior improvements:
  - Do not edit `<stanPath>/system/stan.system.md`; propose durable behavior changes in `<stanPath>/system/stan.project.md` instead.
  - Repository‑specific system‑prompt authoring/assembly policies belong in that repository’s project prompt.

- Project prompt promotion:
  - When a durable, repo‑specific rule or decision emerges during work, propose a patch to `<stanPath>/system/stan.project.md` to memorialize it for future contributors.

- Requirements maintenance & separation guard:
  - STAN maintains durable requirements in `<stanPath>/system/stan.requirements.md` and will propose patches to create/update it on demand when requirements evolve (developers MAY edit directly, but shouldn’t have to).
  - If requirements text appears in `stan.project.md`, or policy/prompt content appears in `stan.requirements.md`, propose a follow‑up patch to move the content to the correct file and keep the separation clean.

- Development plan update:
  - Whenever you propose patches, change requirements, or otherwise make a material update, you MUST update `<stanPath>/system/stan.todo.md` in the same reply and include a commit message (subject ≤ 50 chars; body wrapped at 72 columns).

Notes:

- CLI preflight already runs at the start of `stan run`, `stan snap`, and `stan patch`:
  - Detects system‑prompt drift vs packaged baseline and nudges to run `stan init` when appropriate.
  - Prints version and docs‑baseline information.
- File creation policy:
  - `stan init` does not create `stan.project.md` or `stan.requirements.md` by default. STAN creates or updates these files when they are needed.
- The “always‑on” checks above are assistant‑behavior obligations; they complement (not replace) CLI preflight.

## Monolith read‑only guidance

- Treat `<stanPath>/system/stan.system.md` as read‑only.
- If behavior must change, propose updates to `<stanPath>/system/stan.project.md` instead of editing the monolith.
- Local monolith edits are ignored when archives are attached, and CLI preflight will surface drift; avoid proposing diffs to the monolith.

## Mandatory documentation cadence (gating rule)

- If you emit any code Patch blocks, you MUST also (except deletions‑only or explicitly plan‑only replies):
  - Patch `<stanPath>/system/stan.todo.md` (add a “Completed (recent)” entry; update “Next up” if applicable).
  - Patch `<stanPath>/system/stan.project.md` when the change introduces/clarifies a durable requirement or policy.
- If a required documentation patch is missing, STOP and recompose with the missing patch(es) before sending a reply.

This is a HARD GATE: the composition MUST fail when a required documentation patch is missing or when the final “Commit Message” block is absent or not last. Correct these omissions and re‑emit before sending.

## Dev plan document hygiene (content‑only)

- The development plan at `<stanPath>/system/stan.todo.md` MUST contain only the current plan content. Keep meta‑instructions, aliases, formatting/policy notes, process guidance, or “how to update the TODO” rules OUT of this file.
- Allowed content in the TODO:
  - Header with “When updated: <UTC timestamp>”.
  - “Next up …” (near‑term actionable items).
  - “Completed (recent)” (short, pruned list).
  - Optional sections for short follow‑through notes or a small backlog (e.g., “DX / utility ideas (backlog)”).
- Disallowed in the TODO (move to the project prompt):
  - “ALIASES”, “Purpose”, “Output & formatting policy”, “Plan management policy”, “Notes: … process learnings”, and any other meta‑instructions or policies.
- On every TODO update pass, CLEAN OUT any meta‑instructions that have crept in, leaving only content. Record durable policies and instructions in the project prompt (`<stanPath>/system/stan.project.md`) instead.
- Rationale: Keeping the TODO content‑only preserves focus, avoids duplication, and ensures requirements/process rules live in the authoritative system prompt.
