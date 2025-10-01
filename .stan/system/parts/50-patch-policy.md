# Patch Policy (system‑level)

- Canonical patch path: /<stanPath>/patch/.patch; diagnostics: /<stanPath>/patch/.debug/
  - This directory is gitignored but always included in both archive.tar and archive.diff.tar.
- Patches must be plain unified diffs.
- Prefer diffs with a/ b/ prefixes and stable strip levels; include sufficient context.
- Normalize to UTF‑8 + LF. Avoid BOM and zero‑width characters.
- Forbidden wrappers: do not emit `*** Begin Patch`, `*** Add File:`, `Index:` or other non‑unified preambles; they are not accepted by `git apply` or `stan patch`.
- Tool preference & scope
  - File Ops are the preferred method for moving, copying, and deleting files or directories (single or bulk).
  - Diff Patches are the preferred method for creating files or changing them in place.
  - The one‑patch‑per‑file rule applies to Diff Patch blocks only; File Ops are exempt and may cover many paths in one block.
- Combined workflow
  - When a file is moved and its imports/content must change, do both in one turn:
    1. File Ops: `mv old/path.ts new/path.ts`
    2. Diff Patch: `new/path.ts` with the required edits (e.g., updated imports)

# CRITICAL: Patch generation guidelines (compatible with “stan patch”)

- Format: plain unified diff. Strongly prefer git-style headers:
  - Start hunks with `diff --git a/<path> b/<path>`, followed by `--- a/<path>` and `+++ b/<path>`.
  - Use forward slashes in paths. Paths must be relative to the repo root.
- Strip level: include `a/` and `b/` prefixes in paths (STAN tries `-p1` then `-p0` automatically).
- Context: include at least 3 lines of context per hunk (the default). STAN passes `--recount` to tolerate line-number drift.
- Whitespace: do not intentionally rewrap lines; STAN uses whitespace‑tolerant matching where safe.
- New files / deletions:
  - New files: include a standard diff with `--- /dev/null` and `+++ b/<path>` (optionally `new file mode 100644`).
  - Deletions: include `--- a/<path>` and `+++ /dev/null` (optionally `deleted file mode 100644`).
- Renames: prefer delete+add (two hunks) unless a simple `diff --git` rename applies cleanly.
- Binary: do not include binary patches.
- One-file-per-patch in replies: do not combine changes for multiple files into a single unified diff block. Emit separate Patch blocks per file as required by Response Format.
  - This applies to Diff Patches. File Ops are exempt and may include multiple operations across files.

# Hunk hygiene (jsdiff‑compatible; REQUIRED)

- Every hunk body line MUST begin with one of:
  - a single space “ ” for unchanged context,
  - “+” for additions, or
  - “-” for deletions. Never place raw code/text lines (e.g., “ ),”) inside a hunk without a leading marker.
- Hunk headers and counts:
  - Use a valid header `@@ -<oldStart>,<oldLines> <newStart>,<newLines> @@`.
  - The body MUST contain exactly the number of lines implied by the header: • oldLines = count of “ ” + “-” lines, • newLines = count of “ ” + “+” lines.
  - Do not start a new `@@` header until the previous hunk body is complete.
- File grouping:
  - For each changed file, include one or more hunks under a single “diff --git … / --- … / +++ …” group.
  - Do not interleave hunks from different files; start a new `diff --git` block for the next file.
- Paths and strip:
  - Prefer `a/<path>` and `b/<path>` prefixes (p1). STAN will also try p0 automatically.
  - Paths must use POSIX separators “/” and be repo‑relative.
- Fences and prose:
  - Do not place markdown text, banners, or unfenced prose inside the diff. Keep the diff payload pure unified‑diff.
  - When presenting in chat, wrap the diff in a fence; the fence must not appear inside the diff body.
- Line endings:
  - Normalize to LF (`\n`) in the patch. STAN handles CRLF translation when applying.

## File Ops (optional pre‑ops; structural changes)

Use “### File Ops” to declare safe, repo‑relative file and directory operations that run before content patches. File Ops are for structure (moves/renames, creates, deletes), while unified‑diff Patches are for editing file contents.

- Verbs:
  - mv <src> <dest> # move/rename a file or directory (recursive), no overwrite
  - cp <src> <dest> # copy a file or directory (recursive), no overwrite; creates parents for <dest>
  - rm <path> # remove file or directory (recursive)
  - rmdir <path> # remove empty directory (explicit safety)
  - mkdirp <path> # create directory (parents included)
- Multiple targets:
  - Include as many operations (one per line) as needed to handle an entire related set of structural changes in a single patch turn.
- Paths:
  - POSIX separators, repo‑relative only.
  - Absolute paths are forbidden. Any “..” traversal is forbidden after normalization.
- Arity:
  - mv and cp require 2 paths; rm/rmdir/mkdirp require 1.
- Execution:
  - Pre‑ops run before applying unified diffs.
  - In --check (dry‑run), pre‑ops are validated and reported; no filesystem changes are made.

Examples

```
### File Ops
mkdirp src/new/dir
mv src/old.txt src/new/dir/new.txt
cp src/new/dir/new.txt src/new/dir/copy.txt
rm src/tmp.bin
rmdir src/legacy/empty
```

```
### File Ops
mv packages/app-a/src/util.ts packages/app-b/src/util.ts
mkdirp packages/app-b/src/internal
rm docs/drafts/obsolete.md
```

Combined example (File Ops + Diff Patch)

```
### File Ops
mv old/path/to/file/a.ts new/path/to/file/a.ts
```

Then follow with a Diff Patch in the new location:

```diff
diff --git a/new/path/to/file/a.ts b/new/path/to/file/a.ts
--- a/new/path/to/file/a.ts
+++ b/new/path/to/file/a.ts
@@ -1,3 +1,3 @@
- import { oldThing } from '../../old/module';
+ import { newThing } from '../../new/module';
  export function run() {
-   return oldThing();
+   return newThing();
  }
```
