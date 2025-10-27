// src/runner/run/session/epoch.ts
/**
 * Active session epoch. Callbacks from previous epochs are ignored.
 */
let ACTIVE_EPOCH: symbol | null = null;

/** Start a new epoch and return it. */
export function beginEpoch(): symbol {
  const e = Symbol('session-epoch');
  ACTIVE_EPOCH = e;
  return e;
}

/** True when the provided epoch is still the active one. */
export function isActiveEpoch(e: symbol): boolean {
  return ACTIVE_EPOCH === e;
}
