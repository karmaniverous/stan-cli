/** See <stanPath>/system/stan.project.md for global & cross‑cutting requirements. */
import eslint from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import prettierConfig from 'eslint-config-prettier';
import tsdoc from 'eslint-plugin-tsdoc';
import vitest from '@vitest/eslint-plugin';
import jsonc from 'eslint-plugin-jsonc';
import jsoncParser from 'jsonc-eslint-parser';
import tseslint from 'typescript-eslint';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

const TS_FILES = ['src/**/*.ts', 'src/**/*.tsx'];

const config = [
  // Ignore generated and third‑party artifacts
  {
    ignores: [
      'dist/**',
      '.rollup.cache/**',
      'coverage/**',
      'node_modules/**',
      'docs/**',
      'rollup.config-*.mjs',
      '.stan/**',
    ],
  },

  // Base JS
  eslint.configs.recommended,

  // TypeScript presets (scoped to TS files only)
  ...tseslint.configs.strictTypeChecked.map((c) => ({
    // Scope each preset to our TS globs; avoid applying typed rules to JSON/etc.
    ...(c as Record<string, unknown>),
    files: TS_FILES,
  })),

  // Our project override (parser/project + plugins/rules)
  {
    files: TS_FILES,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir,
      },
    },
    plugins: {
      prettier: prettierPlugin,
      'simple-import-sort': simpleImportSortPlugin,
      tsdoc,
    },
    rules: {
      // Formatting via Prettier
      'prettier/prettier': ['error'],
      // Import ordering
      'simple-import-sort/imports': ['error'],
      'simple-import-sort/exports': ['error'],
      // TS preferences (parity with prior JS config)
      '@typescript-eslint/no-explicit-any': ['error'],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      // TSDoc hygiene (quiet)
      'tsdoc/syntax': ['warn'],
    },
  },

  // Disable stylistic conflicts with Prettier
  prettierConfig,

  // Tests
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { vitest },
    languageOptions: {
      globals: vitest.environments.env.globals,
    },
    // Adopt Vitest’s recommended rule set in test files.
    // Cast required to satisfy FlatConfig typing in this project.
    rules: {
      ...(vitest.configs.recommended?.rules as Record<string, unknown>),
    },
  },

  // JSON (no nested extends)
  {
    files: ['**/*.json'],
    languageOptions: { parser: jsoncParser },
    plugins: { jsonc },
    rules: {
      ...(jsonc.configs['recommended-with-json']?.rules as Record<string, unknown>),
    },
  },
];

export default config;
