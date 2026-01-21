---
title: Patch Workflow & FEEDBACK
---

# Patch workflow & FEEDBACK

Related guides:
- [CLI Usage & Examples](./cli-examples.md)
- [The STAN Loop](./the-stan-loop.md)

**Patch** is the center of gravity for the AI loop. This is where requirements are refined, code is generated, and the commit message is drafted.

## Accepted patch kinds

STAN supports two patch payload kinds:

- **File Ops** (structural operations like move/delete/mkdir)
- **Unified diff** (content edits)

You must not mix both kinds in a single payload.

## Unified diffs (single file per invocation)

- Plain unified diffs with `diff --git`, `---/+++`, and `@@` hunks.
- Paths are relative to the repo root, with POSIX separators (`/`). Prefer `a/` and `b/` prefixes.
- ≥ 3 lines of context per hunk. LF line endings. No base64.
- **Hard rule:** `stan patch` enforces **exactly one target file per patch payload**. For multi-file changes, apply multiple times (one diff per file).

Apply from clipboard (default), argument, or file:

```
stan patch
stan patch --check
stan patch -f changes.patch
```

## File Ops (structural changes)

Use a `### File Ops` block for safe, repo-relative operations:

```
### File Ops
mkdirp src/new/dir
mv src/old.ts src/new/dir/old.ts
rm docs/obsolete.md
```

Then follow with a unified diff for any content edits (in a separate payload).

## On failure: diagnostics envelope

When a patch fails or partially applies, STAN prints a compact diagnostics envelope and (when possible) copies it to your clipboard. Paste it into chat as-is. It includes:

- which apply strategies were attempted,
- exit summaries and jsdiff reasons (when applicable),
- the declared target file(s) (when detectable from the patch headers).

Assistants should respond by generating a corrected unified diff that applies cleanly,
including Full Listings only for the failed file when necessary.

## Tips

- Keep hunks small and anchored; avoid large reflows in Markdown.
- For multi-file changes, emit one diff per file and apply them one at a time.
- For docs: preserve LF; minimal whitespace changes improve reliability.
