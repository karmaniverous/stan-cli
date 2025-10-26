/** See <stanPath>/system/stan.project.md for global requirements. */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
    },
  },
  test: {
    globals: true,
    // Vitest Option 1: default to Node; use DOM only per-suite when truly needed.
    environment: 'node',
    // Use forks unconditionally so tests can safely call process.chdir().
    // Threads pool (worker_threads) forbids chdir in workers.
    pool: 'forks',
    exclude: ['node_modules/**', 'dist/**', '.rollup.cache/**'],
    // Ensure dependencies are inlined so vi.mock('tar') applies within @karmaniverous/stan-core.
    // Vitest v3: use server.deps.inline (deps.inline is deprecated).
    server: {
      deps: {
        inline: ['@karmaniverous/stan-core', 'tar'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/test/**',
        '**/*.d.ts',
        // Exclude trivial barrels and types-only modules from coverage noise
        'src/index.ts',
        'src/runner/index.ts',
        'src/runner/config/index.ts',
        'src/runner/run/index.ts',
        'src/runner/patch/index.ts',
        'src/runner/config/types.ts',
        'src/runner/run/types.ts',
      ],
    },
    reporters: [
      [
        'default',
        {
          summary: false,
        },
      ],
    ],
    setupFiles: [
      resolve(rootDir, 'src/test/setup.ts'),
      resolve(rootDir, 'src/test/mock-tar.ts'),
    ],
    testTimeout: 15000,
    hookTimeout: 10000,
  },
});
