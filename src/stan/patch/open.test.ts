import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock spawn before importing the module under test
const calls: string[] = [];
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    __esModule: true,
    ...actual,
    default: actual as unknown as object,
    spawn: (cmdLine: string) => {
      calls.push(cmdLine);
      // Minimal child process stub with unref()
      return {
        unref() {},
      } as unknown as import('node:child_process').ChildProcess;
    },
  };
});
// IMPORTANT: do NOT import './open' at module scope; we dynamically import it
// after resetModules() inside each test to ensure the mock takes effect.

describe('openFilesInEditor — spawn behavior and guards', () => {
  let dir: string;
  const envBackup = { ...process.env };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'stan-open-'));
    process.env.STAN_BORING = '1'; // stable logs (no color)
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    calls.length = 0;
    // Leave the temp directory before removal to avoid Windows EBUSY
    try {
      process.chdir(tmpdir());
    } catch {
      // ignore
    }
    // Mitigate transient Windows EBUSY/ENOTEMPTY on teardown:
    // - Pause stdin (mirrors global test setup)
    // - Allow a short tick for handles to settle before rm()
    try {
      (process.stdin as unknown as { pause?: () => void }).pause?.();
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 10));
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  const load = async () => {
    // Ensure open.ts is (re)loaded after mocks/env are set
    vi.resetModules();
    const mod = await import('./open');
    return mod.openFilesInEditor;
  };

  it('logs when no open command is configured', async () => {
    const rel = 'a.ts';
    await writeFile(path.join(dir, rel), 'export {};\n', 'utf8');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Import after establishing mock
    const openFilesInEditor = await load();

    openFilesInEditor({ cwd: dir, files: [rel], openCommand: undefined });

    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    expect(logs.some((l) => /no open command configured/i.test(l))).toBe(true);
    expect(calls.length).toBe(0);
  });

  it('skips deleted files and logs an editor-open for existing file when forced in tests', async () => {
    const existing = 'b.ts';
    await writeFile(path.join(dir, existing), 'export const x=1;\n', 'utf8');
    const missing = 'missing.ts';

    // Ensure test gating permits spawn and the mock intercepts it
    process.env.NODE_ENV = 'test';
    process.env.STAN_FORCE_OPEN = '1';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const openFilesInEditor = await load();
    // Use an inert command that includes {file} but does nothing; this
    // prevents launching a real editor if spawn mocking is bypassed.
    openFilesInEditor({
      cwd: dir,
      files: [existing, missing],
      openCommand: 'node -e "process.exit(0)" {file}',
    });

    // Observable behavior: an "open -> ..." log for the existing file
    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    const openedExisting = logs.some((l) =>
      new RegExp(
        `open\\s*->\\s*.*${existing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      ).test(l),
    );
    expect(openedExisting).toBe(true);
  });
});
