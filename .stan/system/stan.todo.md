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
