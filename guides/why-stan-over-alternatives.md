---
title: Why STAN Over Alternatives?
---

# Why STAN Over Alternatives?

STAN focuses on a single goal: making AI‑assisted development reproducible and auditable today, using your existing toolchain.

Related guides:
- [Getting Started](./getting-started.md)
- [The STAN Loop](./the-stan-loop.md)
- [Archives & Snapshots](./archives-and-snapshots.md)

| Tool / Approach         | Reproducible Context | AI‑Ready Archives | Unified Diff Patching | Deterministic Outputs | Learning Curve |
|-------------------------|----------------------|-------------------|-----------------------|-----------------------|----------------|
| STAN                    | Yes (archive.tar + outputs) | Yes (attach in any chat) | Yes (with FEEDBACK loop) | Yes (stdout/stderr captured) | Low |
| “Just chat + copy/paste”| No                   | No                | Manual/error‑prone    | No                    | Low            |
| git stash / branches    | Partial (source only)| No                | Manual                | No                    | Medium         |
| Nix/Guix                | Strong builds        | No (not chat‑oriented) | N/A                 | Indirect              | High           |
| IDE context managers    | Varies               | Varies            | Varies                | No                    | Medium         |

Notes:
- STAN complements git, CI, and your existing scripts. It doesn’t replace them.
- You control exactly what the assistant reads; archives and outputs are explicit and portable.
- The FEEDBACK handshake gives you robust, self‑identifying patch correction.

Use STAN when:
- You want a simple, CLI‑first workflow that works with any AI chat client.
- You care about auditability and deterministic inputs, not speculative memory.
- You want unified diffs and a disciplined patch loop instead of “magic changes.”
