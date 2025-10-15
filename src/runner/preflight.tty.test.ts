import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock getVersionInfo to:
/**
 * - report drift (inSync: false),
 * - not be a dev module repo,
 * - and show a docs version change (prev != cur).
 */
vi.mock('./version', () => ({
  __esModule: true,
  getVersionInfo: async () => ({
    packageVersion: '1.2.3',
    nodeVersion: process.version,
    repoRoot: process.cwd(),
    stanPath: '.stan',
    isDevModuleRepo: false,
    systemPrompt: {
      localExists: true,
      baselineExists: true,
      inSync: false,
    },
    docsMeta: { version: '1.2.2' },
  }),
}));

import { preflightDocsAndVersion } from './preflight';

const setIsTTY = (val: boolean) => {
  try {
    // In Vitest environment, this property is typically writable.
    // Cast to avoid TS complaining about readonly types.
    (process.stdout as unknown as { isTTY?: boolean }).isTTY = val;
  } catch {
    // best-effort; if not writable, non‑TTY branch will exercise by default
  }
};

describe('preflight (TTY-aware messaging)', () => {
  const envBackup = { ...process.env };
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Force drift warnings in test mode
    process.env.STAN_FORCE_DRIFT_WARN = '1';
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore environment
    process.env = { ...envBackup };
  });

  it('prints multi-line guidance in TTY (interactive) mode', async () => {
    setIsTTY(true);

    await preflightDocsAndVersion(process.cwd());

    const warns = warnSpy.mock.calls.map((c) => String(c[0]));
    const logs = logSpy.mock.calls.map((c) => String(c[0]));

    expect(warns.some((m) => /differs from packaged baseline/i.test(m))).toBe(
      true,
    );
    expect(
      warns.some((m) => /will be overwritten by `stan init`/i.test(m)),
    ).toBe(true);
    expect(warns.some((m) => /stan\.project\.md instead/i.test(m))).toBe(true);

    // Multi-line docs change guidance
    expect(
      logs.some((m) => /docs baseline has changed since last install/i.test(m)),
    ).toBe(true);
    expect(logs.some((m) => /Run `stan init` to update prompts/i.test(m))).toBe(
      true,
    );
  });

  it('prints concise one-liners in non‑TTY (CI/logs) mode', async () => {
    setIsTTY(false);

    await preflightDocsAndVersion(process.cwd());

    const warns = warnSpy.mock.calls.map((c) => String(c[0]));
    const logs = logSpy.mock.calls.map((c) => String(c[0]));

    // Single-line drift notice
    expect(
      warns.some((m) => /drift detected; run `stan init` to update/i.test(m)),
    ).toBe(true);

    // Single-line docs change notice
    expect(
      logs.some((m) =>
        /docs baseline changed .* -> .*; run `stan init`/i.test(m),
      ),
    ).toBe(true);
  });
});
