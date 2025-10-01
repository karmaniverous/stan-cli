# Patch failure prompts

When a patch cannot be fully applied, STAN provides a concise diagnostics envelope for the user to paste back into the chat. The user may provide multiple diagnostics envelopes at once.

- Unified‑diff failures
  - diagnostics envelope content (stdout fallback):

    ```
    The unified diff patch for file <path/to/file.ext> was invalid.

    START PATCH DIAGNOSTICS
    <attempt summaries, one per git attempt, in cascade order:
    "<label>: exit <code> — <first stderr line>">
    <jsdiff reasons, when applicable:
    "jsdiff: <path>: <reason>">
    END PATCH DIAGNOSTICS
    ```

  - Attempt summaries are concise, in the exact cascade order tried.
  - jsdiff reasons appear whenever jsdiff was attempted and any file still failed.
  - Do not echo the failed patch body or any excerpt (for example, “cleanedHead”).
    Rely on the patch that already exists in the chat context; correlate the attempt
    summaries and jsdiff reasons to that patch. When additional context is needed,
    request Full Listings for only the affected files instead of reprinting the patch.

- File Ops failures (all repos)
  - diagnostics envelope content (stdout fallback):

    ```
    The File Ops patch failed.

    START PATCH DIAGNOSTICS
    <parser/exec failures; one line per issue>
    END PATCH DIAGNOSTICS
    ```

## Assistant follow‑up (after feedback; all repos)

After reading the diagnostics envelope, analyze the likely causes and present the results briefly. Then offer these options explicitly:

1. New patch[es] (recommended): I’ll emit [a corrected patch | corrected patches] for [path/to/file.ts | the affected files].
2. Full listings: I’ll provide [a full, post‑patch listing | full, post‑patch listings] for [path/to/file.ts | the affected files]. U
