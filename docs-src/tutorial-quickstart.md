---
title: Tutorial — Quickstart (End‑to‑End)
---

# Tutorial — Quickstart (End‑to‑End)

This guided walkthrough takes you from a fresh repo to a complete STAN loop with a small change set applied via patches.

Prereqs:

- Node ≥ 20
- Git installed

## 1) Create or pick a repo

You can use any repo. For a throwaway demo:

```bash
mkdir stan-demo && cd stan-demo
git init
echo '{"name":"stan-demo","version":"0.0.0","type":"module"}' > package.json
echo 'export const hello = () => "Hello";' > hello.js
```

Add basic scripts:

```bash
npm i -D eslint vitest
npm pkg set scripts.test="vitest --run"
npm pkg set scripts.lint="eslint ."
npm pkg set scripts.typecheck="echo ok"   # replace with tsc if you have TS
```

## 2) Install STAN and initialize

```bash
npm i -g @karmaniverous/stan
stan init
```

What this does:

- Creates `stan.config.yml`
- Ensures `.stan/{output,diff,dist,patch}` in .gitignore
- Writes docs metadata under `.stan/system/` and initial diff snapshot

Optional: edit `stan.config.yml` to map STAN scripts to your repo’s tasks.

## 3) Build & Snapshot

```bash
stan run
```

This:

- Runs configured scripts (parallel by default).
- Writes deterministic outputs under `.stan/output/*.txt`.
- Creates `.stan/output/archive.tar` and `.stan/output/archive.diff.tar`.
- Prints concise “archive warnings” (binaries excluded, large text flagged).

## 4) Share & Baseline

Attach `.stan/output/archive.tar` (and `archive.diff.tar` if present) to your AI chat.

Tip: If you need a new chat, ask STAN for a “handoff” block, paste it at the top of the new chat, and attach the latest archives. STAN will verify the signature and resume with full context.

## 5) Discuss & Patch

Iterate in chat. When STAN proposes changes, it will return a plain unified diff (no base64) like:

```diff
diff --git a/hello.js b/hello.js
--- a/hello.js
+++ b/hello.js
@@ -1,1 +1,2 @@
-export const hello = () => "Hello";
+export const hello = () => "Hello world";
+export const shout = () => "HELLO WORLD";
```

Apply it locally:

```bash
stan patch
```

If you want to validate without changing files:

```bash
stan patch --check
```

On failures, STAN writes a compact FEEDBACK packet (and copies it to your clipboard when possible). Paste that into chat and STAN will return a corrected diff.

## 6) Rinse and repeat

- Keep `.stan/system/stan.todo.md` current with each change set.
- Use `stan run -p` to print the plan without side effects; use `stan run -P` to execute without printing the plan first.
- Use `-q` for sequential execution, `-c` to include outputs inside archives and remove them from disk.

## Common pitfalls

- Binary noise: STAN excludes binaries, but extremely large text files may be flagged. Consider adding glob excludes in `stan.config.yml` as needed.
- Unified diffs only: patches must include `diff --git`, `---/+++`, and `@@` hunks (no base64).
- Context drift: STAN attempts tolerant application; add ≥3 lines of context per hunk for robust results.

## Next steps

- Read “Why STAN Over Alternatives?” for positioning and trade‑offs.
- Check the rrstack case study for a real‑world usage story.
- Explore CLI usage & examples for more flags and patterns.
