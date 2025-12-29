---
title: Bootloader & Assistant Setup
---

# Bootloader & assistant setup

STAN’s workflow depends on an assistant being able to **read your attached `archive.tar`** and load the project’s system prompt from inside it:

- `<stanPath>/system/stan.system.md`

Most chat clients do not automatically open a tar archive and locate that file. The “bootloader” is a small system prompt that performs that intake step.

Related guides:
- [Getting Started](./getting-started.md)
- [The STAN Loop](./the-stan-loop.md)
- [Archives & Snapshots](./archives-and-snapshots.md)
- [STAN assistant guide — stan-cli](./stan-assistant-guide.md)

## What the bootloader does

At the start of each chat turn (or when you attach new artifacts), the bootloader:

1. Locates the newest attached `archive.tar` (or `archive.diff.tar` when appropriate).
2. Enumerates its contents and finds `<stanPath>/system/stan.system.md`:
   - Prefer `stanPath` from `stan.config.*` when present.
   - Otherwise fall back to common defaults like `.stan`.
3. Loads `stan.system.md` and uses it as the governing system prompt for the rest of the turn.

This is what makes STAN “reproducible in chat”: the assistant is constrained to the exact files you shipped in the archive.

## Recommended setup (TypingMind)

The simplest path is to use a preconfigured STAN agent in a client that supports long, stable system prompts.

In that setup:

- The bootloader is already installed in the agent.
- You attach `.stan/output/archive.tar` (and optionally `archive.diff.tar`).
- The assistant loads `.stan/system/stan.system.md` automatically.

See [Getting Started](./getting-started.md) for the recommended flow.

## Other chat clients (what you need to ensure)

If you use a different client, you need both:

- A system prompt that contains the bootloader content, and
- The archive attachment that contains `<stanPath>/system/stan.system.md`.

If your assistant says the system prompt is missing, the fix is almost always:

- Re-run `stan run` and attach the resulting `.stan/output/archive.tar`, or
- Attach `<stanPath>/system/stan.system.md` directly as a raw file named `stan.system.md`.

## Practical tips

- Start each new thread with a full `archive.tar` (not only `archive.diff.tar`).
- In subsequent turns within the same thread, attach only `archive.diff.tar` unless you need a full reset.
- If you change `stanPath`, re-run `stan init` and then `stan run` so the archive contains the new workspace layout.

## Related concepts

- [Archives & Snapshots](./archives-and-snapshots.md) explains what goes into `archive.tar` and how diffs are computed.
- [Patch Workflow & Diagnostics](./patch-workflow.md) describes how to apply assistant-generated diffs safely and what to do when a patch fails.
