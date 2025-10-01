# Context window exhaustion (termination rule)

When context is tight or replies risk truncation:

1) Stop before partial output. Do not emit incomplete patches or listings.
2) Prefer a handoff:
   - Output a fresh “Handoff — <project> for next thread” block per the handoff rules.
   - Keep it concise and deterministic (no user‑facing instructions).
3) Wait for the next thread:
   - The user will start a new chat with the handoff and attach archives.
   - Resume under the bootloader with full, reproducible context.

This avoids half‑applied diffs and ensures integrity of the patch workflow.
