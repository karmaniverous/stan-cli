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
    environment: 'node',
    // Prefer threads unless a suite overrides.
    pool: 'threads',
    exclude: ['node_modules/**', 'dist/**', '.rollup.cache/**'],
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
    setupFiles: [resolve(rootDir, 'src/test/setup.ts')],
    testTimeout: 15000,
    hookTimeout: 10000,
  },
});
