# STAN Development Plan

When updated: 2025-10-09 (UTC)

## Track — stan-cli (CLI and runner)

### Next up (priority order)

- Live UI stability (Windows/VS Code)
  - Serialize final frame: stop the render timer before the last paint to avoid races that can drop the footer.
  - Width safety: clamp/truncate Output cells to process.stdout.columns to prevent terminal wrapping from clipping the bottom line.
  - Add a focused integration test to assert the hint persists across restarts/cancels in BORING and styled modes.

- Debug hygiene
  - Keep live tracing (STAN_LIVE_DEBUG) off by default; ensure probes (header/hint) use a correct ANSI strip.

- Cancellation/wiring
  - Keep key handlers attached once per overall run; confirm no double-attach across restarts.

### Completed (recent)

- Hint disappears after first frame (Windows/VS Code)
  - Attach raw-mode key handling before any live frame is painted to avoid the post-attach terminal nudge that clips the footer on the next repaint.
  - Corrected the ANSI strip used by debug probes so header/hint detection reflects reality.
  - Prepared renderer/sink plumbing to allow atomic finalization of the last frame.

- Footer trailing newline
  - Appended a trailing newline to every body passed to log-update (regular and header-only) to reduce bottom-line clipping on terminals that over-clear the live area.
  - Added tests (BORING and styled) that assert trailing newline and persistent hint across multiple repaints.
