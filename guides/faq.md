---
title: FAQ
---

# FAQ

### Do I need to re-upload the full archive every time?

Typically no. Upload the full `archive.tar` once at the start of a chat thread, then attach the smaller `archive.diff.tar` for subsequent turns. If you exhaust your context window, start a fresh chat, ask for a `handoff` in the old one, and paste that into the new chat along with the latest full archive.

### What if my repo contains binaries or large files?

STAN automatically excludes binary files from archives and prints a warning to the console. It also flags very large text files (by size or line count). You can add glob patterns to the `excludes` array in your `stan.config.yml` to ignore specific large files or directories you don't want included.

### Why does STAN use plain unified diffs?

They are a portable, human-readable, and universally supported format for representing code changes. This makes them ideal for an AI-assisted workflow because they are auditable and tool-friendly. STAN’s `FEEDBACK` handshake provides a robust mechanism for automatically correcting patches that fail to apply.

### Can I run STAN in CI?

Yes. The CLI is designed to be deterministic and scriptable. You can run `stan run` in a CI job to generate archives and text outputs, then upload them as build artifacts or use them in subsequent pipeline steps, such as automated documentation publishing or quality checks.

### Is there a library API?

While STAN is packaged as an npm module with exports, its primary and supported interface is the CLI. For deep integration, you can consult the [API reference on the docs site](https://docs.karmanivero.us/stan).