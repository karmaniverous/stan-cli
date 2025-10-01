/** See <stanPath>/system/stan.project.md for global & cross‑cutting requirements. */
/* eslint-env node */
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsonc from 'eslint-plugin-jsonc';
import jsoncParser from 'jsonc-eslint-parser';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tsdoc from 'eslint-plugin-tsdoc';
import vitest from '@vitest/eslint-plugin';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
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

  // TypeScript (type-aware under src/**)
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      ...c.languageOptions,
      parserOptions: {
        ...(c.languageOptions?.parserOptions ?? {}),
        project: ['./tsconfig.json'],
        tsconfigRootDir,
      },
    },
    plugins: {
      ...(c.plugins ?? {}),
      prettier: prettierPlugin,
      'simple-import-sort': simpleImportSort,
      tsdoc,
    },
    rules: {
      ...(c.rules ?? {}),
      // Defer to the repo Prettier config (.prettierrc.json) as the single source of truth.
      'prettier/prettier': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      // Our TS preferences
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      // Quieter tsdoc syntax checks (we fix the worst offenders in-source)
      'tsdoc/syntax': 'warn',
    },
  })),

  // Tests
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { vitest },
    languageOptions: {
      globals: vitest.environments.env.globals,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Tests/mocks often return Promises or use async wrappers without awaits.
      // Avoid busywork fixes; require-await adds little value in tests.
      '@typescript-eslint/require-await': 'off',
    },
  },

  // JSON (no nested extends)
  {
    files: ['**/*.json'],
    languageOptions: { parser: jsoncParser },
    plugins: { jsonc },
    rules: {
      ...(jsonc.configs['recommended-with-json'].rules ?? {}),
    },
  },
];
