# Patch rules & canonical examples (quick)

Use plain unified diffs with git‑style headers. One Patch block per file.

Key rules

- Tool selection & combination
  - Prefer File Ops for structural changes:
    - mv/cp/rm/rmdir/mkdirp are the first choice for moving, copying, and deleting files or directories (single or bulk).
    - The one‑patch‑per‑file rule applies to Diff Patch blocks only; it does NOT apply to File Ops.
  - Prefer Diff Patches for file content:
    - Create new files or modify existing files in place using plain unified diffs.
  - Combine when appropriate:
    - For example, move a file with File Ops, then follow with a Diff Patch in the new location to update imports or content.

- Failure prompts:
  - If a unified‑diff patch fails for one or more files, STAN copies one line per failed file to your clipboard requesting a full, post‑patch listing for just those files (stdout fallback if clipboard is unavailable).
  - If a File Ops block fails (parse or exec), STAN copies a prompt that quotes the original fenced “### File Ops” block and asks to redo the operation via unified diffs (stdout fallback if clipboard is unavailable).
  - No persisted diagnostics (.rej, attempts.json, per‑attempt logs) are written.

- Exactly one header per Patch block:
  - `diff --git a/<path> b/<path>`
  - `--- a/<path>` and `+++ b/<path>` - At least 3 lines of context per hunk (`@@ -oldStart,oldLines +newStart,newLines @@`)
- Paths: POSIX separators; repo‑relative; prefer `a/` and `b/` prefixes (STAN tries `-p1` then `-p0`).
- Line endings: normalize to LF in the patch.
- Create/delete:
  - New file: `--- /dev/null` and `+++ b/<path>`
  - Delete: `--- a/<path>` and `+++ /dev/null`
- Forbidden wrappers (not valid diffs): `*** Begin Patch`, `*** Add File:`, `Index:` or mbox/email prelude lines. Do not use them.

Canonical examples

Modify existing file:

```diff
diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,4 +1,4 @@
-export const x = 1;
+export const x = 2;
 export function y() {
   return x;
 }
```

New file:

```diff
diff --git a/src/newfile.ts b/src/newfile.ts
--- /dev/null
+++ b/src/newfile.ts
@@ -0,0 +1,4 @@
+/** src/newfile.ts */
+export const created = true;
+export function fn() { return created; }
+
```

Delete file:

```diff
diff --git a/src/oldfile.ts b/src/oldfile.ts
--- a/src/oldfile.ts
+++ /dev/null
@@ -1,4 +0,0 @@
-export const old = true;
-export function gone() {
-  return old;
-}
```

Pre‑send checks (quick)

- Every Patch block contains exactly one `diff --git a/<path> b/<path>`.
- No forbidden wrappers appear in any Patch block.
- Create/delete patches use `/dev/null` headers as shown above.
