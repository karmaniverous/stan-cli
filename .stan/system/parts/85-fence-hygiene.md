# Fence Hygiene (Quick How‑To)

Goal: prevent hashed or broken templates/examples that contain nested code blocks.

Algorithm
1) Scan every block you will emit (patches, templates, examples). Compute the maximum contiguous run of backticks inside each block’s content.
2) Choose the outer fence length as N = (max inner backticks) + 1 (minimum 3).
3) Re‑scan after composing. If any block’s outer fence is ≤ the max inner run, bump N and re‑emit.

Hard rule (applies everywhere)
- Do not rely on a fixed backtick count. Always compute, then re‑scan.
- This applies to the Dependency Bug Report template, patch failure diagnostics envelopes, and any example that includes nested fenced blocks.