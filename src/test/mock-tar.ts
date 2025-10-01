/* src/test/mock-tar.ts
 * Global tar mock for tests. Prevents accidental real archiving from stalling tests.
 * Opt out per run or per suite by setting STAN_TEST_REAL_TAR=1 before importing code that calls tar.
 */
import { vi } from 'vitest';

if (process.env.STAN_TEST_REAL_TAR !== '1') {
  try {
    vi.mock('tar', () => ({
      __esModule: true,
      default: undefined,
      create: async ({ file }: { file: string }) => {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(file, 'TAR', 'utf8');
      },
    }));
  } catch {
    // best-effort; if already mocked in a suite, ignore
  }
}
