// src/test/setup.ts
/**
 * Test setup
 * - Avoid Windows EBUSY on rm(tempDir) by ensuring we are not inside the directory being removed.
 *   We reset cwd before and after each test to a neutral location.
 */
import { tmpdir } from 'node:os';

import { afterEach, beforeEach } from 'vitest';

// Phase‑2 transition: default legacy acceptance for tests unless explicitly disabled.
if (!('STAN_ACCEPT_LEGACY' in process.env))
  process.env.STAN_ACCEPT_LEGACY = '1';

beforeEach(() => {
  try {
    process.chdir(tmpdir());
  } catch {
    // ignore
  }
});

afterEach(async () => {
  try {
    process.chdir(tmpdir());
  } catch {
    // ignore
  }
  // On Windows, ensure stdin is paused and allow a brief tick for
  // any lingering handles to release before test teardown removes temp dirs.
  try {
    (process.stdin as unknown as { pause?: () => void }).pause?.();
  } catch {
    // ignore
  }
  await new Promise((r) => setTimeout(r, 25));
});
