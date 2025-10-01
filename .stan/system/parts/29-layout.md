# CRITICAL: Layout

- stanPath (default: `.stan`) is the root for STAN operational assets:
  - `/<stanPath>/system`: prompts & docs
    - `stan.system.md` — repo‑agnostic monolith (read‑only; assembled from parts)
    - `stan.project.md` — project‑specific prompt/policies that augment the system prompt (not for requirements)
    - `stan.requirements.md` — project requirements (desired end‑state). Maintained by STAN; developers MAY edit directly, but shouldn’t have to. Created on demand when needed (not by `stan init`).
  - `/<stanPath>/output`: script outputs and `archive.tar`/`archive.diff.tar`
  - /<stanPath>/diff: diff snapshot state (`.archive.snapshot.json`, `archive.prev.tar`, `.stan_no_changes`)
  - `/<stanPath>/dist`: dev build (e.g., for npm script `stan:build`)
  - `/<stanPath>/patch`: canonical patch workspace (see Patch Policy)
- Config key is `stanPath`.
- Bootloader note: A minimal bootloader may be present at `/<stanPath>/system/stan.bootloader.md` to help assistants locate `stan.system.md` in attached artifacts; once `stan.system.md` is loaded, the bootloader has no further role.
