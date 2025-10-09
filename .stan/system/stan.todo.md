# STAN Development Plan

When updated: 2025-10-09 (UTC)

## Track — stan-cli (CLI and runner)

### Next up (priority order)

- Live UI follow‑through
  - Optional width safety: clamp/truncate Output cells to process.stdout.columns if we observe terminal wrapping clipping in practice (not required now).
  - Consider optional alt‑screen default only on Windows if user feedback indicates preference; currently enabled globally with STAN_LIVE_ALT_SCREEN=0 override.

- Debug hygiene
  - Keep live tracing (STAN_LIVE_DEBUG) off by default; ensure probes (header/hint) use a correct ANSI strip.

- Cancellation/wiring
  - Keep key handlers attached once per overall run; confirm no double-attach across restarts.

### Completed (recent)

- UI decomposition (DRY)
  - Promoted src/stan/run/ui/\* as the canonical UI module; added prepareForNewSession and flushNow, and idempotent stop guard to LiveUI.
  - Updated restart cancellation to paint CANCELLED immediately and detach keys before the next session.
  - Removed the monolithic src/stan/run/ui.ts; folder barrel exports are now used by imports of './ui'.

- Patch classification hardening
  - Fixed misclassification of File Ops–only patches as file-opsdiff in stan patch.
  - Now treats a payload as a diff only when unified‑diff headers are present (via collectPatchedTargets on the cleaned body).
  - Added a regression test to assert FO‑only payloads succeed and are not rejected as mixed kind.

- Live restart/footer tests — relax brittle assertions
  - Footer trailing newline: account for the writer’s trailing “CR + CSI K” clears by stripping those sequences before asserting the final newline.
  - Corrected ESC in the clear-sequence regex (use \x1B, not a literal “\\x1B”).
  - Avoid no-control-regex by switching to RegExp constructor for the clear sequence and normalize the assertion to accept newline followed by whitespace.
  - Fixed a variable ordering issue in live.restart.behavior.test.ts (use `ups` after declaration).
  - Restart repaint visibility: accept any of the following after restart: an explicit CANCELLED repaint, an explicit first-row start for the re-queued script, or any header repaint (fast terminals). Keep the UI parity checks intact.
  - Ghost-fail guard: assert “no [FAIL] before start” only when we can positively detect the first post-restart start frame; skip otherwise to avoid false negatives in racy environments.

- Patch UX & service refactor
  - Patch logs: keep all “stan: …” lines contiguous and print exactly one trailing blank line after the final log (before the shell prompt).
  - Removed mid‑sequence blank lines prior to the diagnostics line; diagnostics copy notice now appears immediately after the status.
  - DRY patch service with helpers for editor open, diagnostics copy, and final newline; eliminated repeated config loads and clipboard calls.

- Run table fixes
  - Headers: removed default left padding and ad‑hoc line trimming; with per‑column left alignment, “Time” and “Output” are now strictly flush‑left with their columns.
  - Spacing: increased inter‑column spacing to two spaces for readability.
  - WARN rows: the Output column now displays the file path for [WARN] as it does for [OK]/[FAIL], matching logger parity.
  - Final spacing: the writer now always terminates a frame with a single newline; the CLI no longer prints an extra newline after stopping live UI, ensuring exactly one blank line after the table (with the hint hidden) before the next prompt.
  - Tick stability: removed an extra newline that was appended at the end of every paint and caused the frame to “walk” down one line per tick. The cursor now returns exactly to the top of the previous frame.
  - Restart visibility: immediately flush a CANCELLED frame when ‘r’ is pressed so a CANCELLED repaint is guaranteed to appear between restart and the next session.

- Patch diagnostics & editor behavior
  - On patch failures, copy the diagnostics envelope to the system clipboard (do not print the full envelope to the console) and print a concise instruction to paste it into chat for a full, post‑patch listing.
  - Include a declarative file identification line at the top of the diagnostics envelope:
    - `file: <repo‑relative path>`
  - Open the target file in the configured editor for both successful patches and failures (non‑check).

- Live table stability & config
  - Removed invalid `stringLength` option from the `table` config to resolve runtime “Invalid config” and TypeScript/lint errors; kept flush‑left alignment and no‑border rendering.

- Patch service decomposition & policy enforcement
  - Decomposed patch orchestrator into small helpers: src/stan/patch/{input.ts,diff.ts,diagnostics.ts,editor.ts,status.ts}.
  - FO vs Diff classification: • File Ops patches are FO-only; presence of diff content is rejected. • Diff patches are single-file only; multi-file diffs are rejected with a clear envelope.
  - FO-only path executes/validates File Ops (dry-run under --check) and returns concise status.
  - Persist raw patch body to .stan/patch/.patch for FO auditability.
  - Diagnostics envelopes now list declared files/targets up front for clarity.
  - Editor open retained for successful diff apply (non--check), best‑effort and detached.

- Patch service follow‑through (typecheck/lint)
  - Normalized envelope argument (js: null → undefined) to satisfy typecheck.
  - Made editor helper synchronous; removed unused local in diagnostics.
  - Kept module sizes small and policy‑aligned.

- Patch UX: open modified files after successful apply
  - After a successful `stan patch` (non-`--check`), open each modified file in the configured editor via `patchOpenCommand` (default `code -g {file}`), detached and best‑effort. - Skips in tests or when `STAN_OPEN_EDITOR=0` is set; failures are ignored.

- Anchored writer: first-frame newline and stable finalization
  - First paint writes the composed body “as-is” (no CR prefix) so the frame begins with a literal leading newline after ANSI stripping (fixes alignment test).
  - Subsequent paints continue per-line CR + CSI K clears only; scrollback remains intact. Finalization persists a hintless table.
- Tests aligned to no-bridge policy and repaint stability
  - live.footer trailing-newline test: assert at least one active (WAIT|RUN) repaint with hint (reduced sensitivity to timing), and no hint in final frame.
  - live.restart.\* tests: detect active frames via WAIT|RUN and assert a CANCELLED flush appears between restart and the next session; avoid header-only bridge expectations.

- Anchored Writer (extractable module) and final UX
  - Replaced log-update with a content-agnostic writer at src/anchored-writer (per-line CR+CSI K updates; no alt-screen; hides cursor).
  - Renderer uses the anchored writer only; no global clears; scrollback remains intact.
  - No header-only bridge on cancel/restart; on restart we mark in-flight rows CANCELLED and overwrite in place when the new session begins.
  - Leading/trailing blank lines preserved; final frame hides the hint per requirements.
- FullClearWriter integration (eliminate log-update dependency)
  - Introduced a tiny writer abstraction (start/write/clear/done) and a FullClearWriter that uses ESC [H + ESC [J per frame with hidden cursor and a single write.
  - Renderer now uses the writer exclusively; removed diff/patch logic and one‑frame hard‑clear. Finalization is atomic (stop timer → render final → done()).
  - Preserved footer composition (summary + hint) and trailing newline + safety pad.
  - Added optional alt‑screen; default enabled (disable with STAN_LIVE_ALT_SCREEN=0).
  - Removed runtime dependency on log-update from package.json.
- Tests updated
  - Reworked live restart/footer tests to spy on process.stdout writes instead of mocking log-update.
  - Confirmed hint persistence across consecutive repaints and that final frames end with a newline.
  - Restart/cancel integration continues to assert header-only bridge or CANCELLED carryover without any global clear calls.

- Hint disappears after first frame (Windows/VS Code)
  - Attach raw-mode key handling before any live frame is painted to avoid the post-attach terminal nudge that clips the footer on the next repaint.
  - Corrected the ANSI strip used by debug probes so header/hint detection reflects reality.
  - Prepared renderer/sink plumbing to allow atomic finalization of the last frame.

- Footer trailing newline
  - Appended a trailing newline to every body passed to log-update (regular and header-only) to reduce bottom-line clipping on terminals that over-clear the live area.
  - Added tests (BORING and styled) that assert trailing newline and persistent hint across multiple repaints.
