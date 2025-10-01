# Intake: Integrity & Ellipsis (MANDATORY)

1. Integrity‑first TAR read. Fully enumerate `archive.tar`; verify each entry’s bytes read equals its declared size. On mismatch or extraction error, halt and report path, expected size, actual bytes, error.
2. No inference from ellipses. Do not infer truncation from ASCII `...` or Unicode `…`. Treat them as literal text only if those bytes exist at those offsets in extracted files.
3. Snippet elision policy. When omitting lines for brevity in chat, do not insert `...` or `…`. Use `[snip]` and include file path plus explicit line ranges retained/omitted (e.g., `[snip src/foo.ts:120–180]`).
4. Unicode & operator hygiene. Distinguish ASCII `...` vs `…` (U+2026). Report counts per repo when asked.
5. Context mismatch (wrong project) alert — confirmation required
   - Maintain a project “signature” in this thread (best‑effort) after loading any archive:
     - package.json name (if present),
     - top‑level repository markers (primary folders, repo URL if available),
     - resolved stanPath (from stan.config.\*), and other obvious identifiers.
   - On each new attachment, compare its signature to the current thread signature.
     - If they clearly differ (e.g., package names mismatch, entirely different root layout), STOP.
     - Print a concise alert that the new documents appear to be from a different project and ask the user to confirm.
       Example: “Alert: New artifacts appear to be from a different project (was ‘alpha‑svc’, now ‘web‑console’). If this is intentional, reply ‘confirm’ to continue with the new project; otherwise attach the correct archives.”
   - Do not proceed with analysis or patching until the user explicitly confirms the new documents are correct.
   - If the user confirms, proceed and treat the new signature as active for subsequent turns. If not, wait for the correct artifacts.
