# Project‑Specific Prompt (STAN)

This file contains assistant behavior and repo‑specific process rules that are not durable “requirements” (which now live in stan.requirements.md). Keep this document focused on policies, composition rules, and cross‑repo guidance.

## Separation of concerns (project prompt vs requirements)

- Durable, testable requirements now live in `.stan/system/stan.requirements.md` (split between stan-core and stan-cli).
- This project prompt governs assistant behavior, authoring/assembly policy for prompts, cross‑repo recommendation cadence, and adapter expectations.

## Authoring & assembly (system prompt parts → monolith)

- Author the system prompt as parts under `.stan/system/parts`.
- Assemble to `.stan/system/stan.system.md` with `npm run gen-system`.
- The packaged module includes `dist/stan.system.md`.
- Downstream, the CLI injects the packaged monolith during full archive (and restores afterward) to keep archives self‑contained.

## Cross‑repo recommendation policy (assistant behavior)

- When a change crafted in this repo requires or would benefit from changes in the other repo:
  - Propose the change and explicitly recommend opening an issue/PR in the other project.
  - Keep engine vs adapter boundaries clear in the recommendation text:
    - stan-core for engine logic, selection/archiving/patch handling.
    - stan-cli for TTY/runner, key handling, plan printing, help, and editors.
- When responding to diagnostics, prefer the smallest safe change in the appropriate repo and capture the cross‑repo recommendation explicitly.

## Imports bridge policy

- To keep chat loops well-contextualized without bloating archives:
  - Each repo should configure imports to stage the other repo’s high‑signal docs beneath `<stanPath>/imports/<label>/…`.
  - Recommended labels:
    - In stan-core: `cli-docs` → stan-cli docs/README/changelog.
    - In stan-cli: `core-docs` → stan-core API/reference change notes.
  - These imports are staged before archiving and appear in both full and diff archives, subject to reserved path exclusions.

## Dev‑mode diagnostics triage (unchanged)

- Analyze diagnostics from `stan patch`, then ask explicitly:
  - Apply insights now (recommended), or
  - Request listings / Defer to dev plan.
- Only emit patches when explicitly approved; end with a commit message and keep documentation cadence rules.

## Patch diagnostics envelope (unified)

- Continue to emit the unified diagnostics envelope (attempt summaries + jsdiff reasons) to standard output for both downstream and STAN repos.
- Follow-up options to present consistently:
  1. New patch(es) for affected file(s) (recommended),
  2. Full listings of affected file(s).

## Selection & execution policy (summary)

- CLI defaults: flags > cliDefaults > built‑ins.
- Run defaults: run all configured scripts, archive enabled, live enabled on TTY.
- Cancellation MUST skip archive/diff phases; late‑cancel guard before archiving.

## Patch Extensions — File Ops (summary)

- Allow declarative mv/cp/rm/rmdir/mkdirp with safe path normalization.
- For failures, emit the unified diagnostics envelope.

## Out‑of‑scope reminders

- Do not place durable requirements here; move them to stan.requirements.md.
- Keep this file focused on assistant behavior and cross‑repo guidance.
