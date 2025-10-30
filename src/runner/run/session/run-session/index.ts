// src/runner/run/session/run-session/index.ts
// Thin entry for the decomposed run-session module.
// Keep the public surface stable for consumers importing "./run-session".

export { runSessionOnce } from './orchestrator';
export type { SessionOutcome } from '@/runner/run/session/types';
