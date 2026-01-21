---
title: The STAN Loop
---

# The STAN Loop

![STAN Loop](https://github.com/karmaniverous/stan-cli/raw/main/assets/stan-loop.png)

STAN establishes a simple, reproducible loop for AI‑assisted development.

This cycle ensures that your assistant always works from the ground truth of your code and tool outputs, eliminating hallucinations about project state.

## 1) Build & Snapshot

- Edit code locally.
- Run `stan run` to:
  - Execute your configured scripts (build/test/lint/typecheck, etc.).
  - Capture deterministic text outputs under `.stan/output/*.txt`.
  - Create `archive.tar` (full snapshot of text sources) and `archive.diff.tar` (files changed since the last snapshot).
- Archive warnings are written to the console (binaries excluded; large text call‑outs).

Tips:

- Use `stan run -p` to print the plan without side effects; use `stan run -P` to execute without printing the plan first.
- Use `-q` for sequential execution (preserves `-s` order).
- Use `-c` to include outputs inside archives and remove them from disk (combine mode).

## 2) Share & Baseline

After committing your local changes:

- **Share:** Attach `.stan/output/archive.tar` (and `archive.diff.tar` if present) in your chat.
- **Baseline:** Run `stan snap` to update the diff baseline. This resets the "changed" tracking for the next iteration.
- **Intake:** In chat, the assistant reads the system prompt directly from the archive and verifies its integrity before proceeding.

*See: [Archives & Snapshots](./archives-and-snapshots.md)*

Notes:

- The bootloader system prompt ensures the correct `stan.system.md` is loaded from the archive (see Getting Started).
- Starting a new thread? Ask STAN to generate a “handoff” block and paste it at the top of your new chat (see step 4 below).
- If the system prompt appears to differ from the packaged baseline or docs were updated, CLI preflight prints a concise nudge.

## 3) Discuss & Patch

- **Discuss:** Iterate in chat to refine requirements, debug issues, or plan features. The assistant sees exactly what you see.
- **Patch:** The assistant generates plain unified diffs with adequate context.
- **Apply:** Use the CLI to apply these changes safely:
  - `stan patch` (clipboard by default),
  - `stan patch -f <file>` (from a file),
  - `stan patch --check` (validate only; writes to sandbox).
- On failure, STAN writes a compact FEEDBACK packet and (when possible) copies it to your clipboard—paste it back into chat to get a corrected diff.

*See: [Patch Workflow & Diagnostics](./patch-workflow.md)*

## 4) Handoff (start a new thread)

Sometimes you need a fresh chat (for example, when the context window is exhausted or you’re switching clients). To preserve continuity without re‑explaining the project:

1. In your current chat, ask STAN for a “handoff” (e.g., “handoff for next thread”).
2. STAN returns a single self‑identifying code block that includes:
   - Project signature (package name, stanPath, node range)
   - Current state from the latest run (Build/Test/Lint/Typecheck/Docs/Knip)
   - Outstanding tasks / near‑term focus
   - Assistant startup checklist (what STAN should do first next thread)
3. In the new chat:
   - Paste the handoff block as the first message.
   - Attach the latest `.stan/output/archive.tar` (and `archive.diff.tar` if present).
   - STAN will verify the signature, load the prompt from the archive, and execute the startup checklist.

## Rinse and repeat

- Return to step 1 and continue until the feature is complete, CI is green, and the plan (`.stan/system/stan.todo.md`) is up‑to‑date.

## Why this loop?

- Reproducible context: all inputs to the discussion are deterministic (source snapshot + text outputs).
- Auditable diffs: patches are plain unified diffs with adequate context; failures come with actionable FEEDBACK.
- Minimal ceremony: one command to capture, one to apply.

## Pro tips

- Keep patches tight and anchored. Include ≥3 lines of context and use `a/` and `b/` path prefixes.
- Use `--check` before overwriting files; let FEEDBACK drive corrections instead of manual fixes.
- Update `.stan/system/stan.todo.md` as part of each change set; include a commit message (fenced) in chat.
- Prefer smaller loops (fewer files at a time) when exploring or refactoring to keep reviews fast and reliable.
