/* src/test/mock-tar.ts
 * Global tar mock for tests. Prevents accidental real archiving from stalling tests.
 * Opt out per run or per suite by setting STAN_TEST_REAL_TAR=1 before importing code that calls tar.
 */
import { vi } from 'vitest';

export type TarCall = {
  file: string;
  cwd?: string;
  filter?: (p: string, s: unknown) => boolean;
  files: string[];
};

declare global {
  var __TAR_CALLS__:
    | Array<{
        file: string;
        cwd?: string;
        filter?: (p: string, s: unknown) => boolean;
        files: string[];
      }>
    | undefined;
}

const ensureStore = (): NonNullable<typeof globalThis.__TAR_CALLS__> => {
  if (!globalThis.__TAR_CALLS__) globalThis.__TAR_CALLS__ = [];
  return globalThis.__TAR_CALLS__;
};

export const __tarCalls = (): TarCall[] => ensureStore().slice();
export const __clearTarCalls = (): void => {
  globalThis.__TAR_CALLS__ = [];
};

if (process.env.STAN_TEST_REAL_TAR !== '1') {
  try {
    vi.mock('tar', () => {
      const record = async (
        opts: {
          file: string;
          cwd?: string;
          filter?: (p: string, s: unknown) => boolean;
        },
        files: string[],
      ) => {
        const store = ensureStore();
        store.push({
          file: opts.file,
          cwd: opts.cwd,
          filter: opts.filter,
          files,
        });
        const { writeFile } = await import('node:fs/promises');
        await writeFile(opts.file, 'TAR', 'utf8');
      };
      return {
        __esModule: true,
        default: undefined,
        // tar.create(opts, files)
        create: record,
        // tar.c(opts, files)
        c: record,
      };
    });
  } catch {
    // best-effort; if already mocked in a suite, ignore
  }
}
