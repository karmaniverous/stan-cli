---
title: FAQ
---

# FAQ

Related guides:
- [Getting Started](./getting-started.md)
- [The STAN Loop](./the-stan-loop.md)
- [Archives & Snapshots](./archives-and-snapshots.md)
- [CLI Usage & Examples](./cli-examples.md)

## Do I need to re-upload the full archive every time?

Typically no. Upload the full `archive.tar` once at the start of a chat thread, then attach the smaller `archive.diff.tar` for subsequent turns. If you exhaust your context window, start a fresh chat, ask for a `handoff` in the old one, and paste that into the new chat along with the latest full archive.

## What if my repo contains binaries or large files?

STAN automatically excludes binary files from archives and prints a warning to the console. It also flags very large text files (by size or line count). You can add glob patterns to the `excludes` array in your `stan.config.yml` to ignore specific large files or directories you don't want included.

## Why does STAN use plain unified diffs?

They are a portable, human-readable, and universally supported format for representing code changes. This makes them ideal for an AI-assisted workflow because they are auditable and tool-friendly. STAN’s `FEEDBACK` handshake provides a robust mechanism for automatically correcting patches that fail to apply.

## Why does `stan patch` reject multi-file diffs?

`stan patch` enforces **one target file per patch payload**. This keeps patches auditable, reduces failure surface area, and makes retries (diagnostics → corrected patch) deterministic. For multi-file changes, apply multiple patches (one per file).

See: [Patch Workflow & Diagnostics](./patch-workflow.md)

## What is `stanPath`?

`stanPath` is the name of the STAN workspace directory inside your repo (default `.stan`). It contains:

- `system/` prompts and metadata
- `output/` script outputs and archives
- `diff/` snapshot baselines and history
- `patch/` patch workspace

See: [Stan Configuration](./configuration.md)

## What if I have a legacy (non-namespaced) config?

Run:

```bash
stan init
```

It migrates legacy root keys into `stan-core` and `stan-cli`, writes a `.bak`, and preserves YAML vs JSON.

See: [Migration — Namespaced Configuration](./migration.md)

## What is the bootloader and why do I need it?

Most chat clients don’t automatically “open” your tar archive and read `.stan/system/stan.system.md`. The bootloader is the system prompt that performs that archive intake step.

See: [Bootloader & Assistant Setup](./bootloader.md)

## Can I run STAN in CI?

Yes. The CLI is designed to be deterministic and scriptable. You can run `stan run` in a CI job to generate archives and text outputs, then upload them as build artifacts or use them in subsequent pipeline steps, such as automated documentation publishing or quality checks.

## Is there a library API?

While STAN is packaged as an npm module with exports, its primary and supported interface is the CLI. For deep integration, you can consult the [API reference on the docs site](https://docs.karmanivero.us/stan).