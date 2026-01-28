# Scratch: Removing live console keys (q/r)

## Current objective
- Removing the interactive `q` and `r` keys from the live run console.
- Cancellation now relies on standard SIGINT (Ctrl-C) which is already handled via signals.
- Simplifying the session runner (removing restart loop) and UI internals.