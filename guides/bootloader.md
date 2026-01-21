---
title: Reference — The Bootloader
---

# Reference: The Bootloader

STAN’s workflow depends on an assistant being able to **read your attached `archive.tar`** and load the project’s system prompt directly from the archive content:

- `<stanPath>/system/stan.system.md`

Related guides:

- [Getting Started](./getting-started.md)
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

## Setup

For instructions on how to set up an assistant with the bootloader (TypingMind, ChatGPT, or Gemini), please see the [Getting Started](./getting-started.md) guide.

## Troubleshooting

If your assistant says the system prompt is missing, the fix is almost always:

- Re-run `stan run` and attach the resulting `.stan/output/archive.tar`, or
- Attach `<stanPath>/system/stan.system.md` directly as a raw file named `stan.system.md`.
