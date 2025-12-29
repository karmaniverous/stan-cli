---
title: Patch Workflow & FEEDBACK
---

# Patch workflow & FEEDBACK

## Unified diffs only
- Plain unified diffs with `diff --git`, `---/+++`, and `@@` hunks.
- Paths relative to repo root, POSIX separators, prefer `a/` and `b/` prefixes.
- ≥ 3 lines of context per hunk. LF endings; no base64.

Apply from clipboard (default), argument, or file:

```
stan patch
stan patch --check
stan patch -f changes.patch
```

## On failure: FEEDBACK envelope

When a patch fails or partially applies, STAN writes a compact feedback packet
to `.stan/patch/.debug/feedback.txt` and (when possible) copies it to your clipboard.
Paste it into chat as-is. It includes:

- engines tried (git/jsdiff),
- strip levels attempted,
- failing files and diagnostics (paths, context, EOL),
- a small excerpt of the cleaned patch head,
- last error snippet from git, when available.

Assistants should respond by generating a corrected unified diff that applies cleanly,
including Full Listings only for the failed files when necessary.

## Tips

- Keep hunks small and anchored; avoid large reflows in Markdown.
- For multi-file changes, emit a separate `diff --git` block per file.
- For docs: preserve LF; minimal whitespace changes improve reliability.
