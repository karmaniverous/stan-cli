---
title: Case Study — rrstack
---

# Case Study — rrstack

[rrstack](https://github.com/karmaniverous/rrstack) was built in just a couple of days while iterating on STAN itself. The project’s development loop looked like this:

- Build & Snapshot: frequent `stan run` kept a reproducible context (source snapshot + deterministic outputs).
- Share & Baseline: archives attached in chat ensured the assistant always had the same view of the repo.
- Discuss & Patch: STAN proposed plain unified diffs with adequate context; failures produced compact FEEDBACK envelopes for automatic correction.

## Why it was fast

- Reproducible context prevented back‑and‑forth clarifications.
- Deterministic outputs simplified diagnosis (e.g., one‑line test diffs).
- Always‑on diffs meant changes were small and auditable.

## What to copy

- Keep your `stan.config.yml` scripts lean and deterministic.
- Run `stan run` often to baseline new changes before chat iterations.
- Use `stan patch --check` for risky changes, then apply once green.

## Repo links

- rrstack: https://github.com/karmaniverous/rrstack
- STAN: https://github.com/karmaniverous/stan
