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
    environment: 'happy-dom',
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
        'src/stan/index.ts',
        'src/stan/config/index.ts',
        'src/stan/run/index.ts',
        'src/stan/patch/index.ts',
        'src/stan/config/types.ts',
        'src/stan/run/types.ts',
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
