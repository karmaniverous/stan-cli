/** See <stanPath>/system/stan.project.md for global requirements. */
import aliasPlugin, { type Alias } from '@rollup/plugin-alias';
import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terserPlugin from '@rollup/plugin-terser';
import typescriptPlugin from '@rollup/plugin-typescript';
import fs from 'fs-extra';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import type {
  InputOptions,
  OutputOptions,
  Plugin,
  RollupOptions,
} from 'rollup';
import dtsPlugin from 'rollup-plugin-dts';

const outputPath = 'dist';

// Path alias @ -> <abs>/src (absolute to avoid module duplication warnings in Rollup)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcAbs = path.resolve(__dirname, 'src');
const aliases: Alias[] = [{ find: '@', replacement: srcAbs }];
const alias = aliasPlugin({ entries: aliases });

// Treat Node built-ins and node: specifiers as external.
const nodeExternals = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

// Runtime deps that must not be bundled (rely on package assets / fallbacks)
const externalPkgs = new Set<string>([
  'clipboardy', // requires platform fallback binaries at runtime; bundling breaks resolution
  // fs-extra is a runtime dependency; keep external to avoid bundling its internals.
  'fs-extra',
]);const copyDocsPlugin = (dest: string): Plugin => {
  return {    name: 'stan-copy-docs',
    async writeBundle() {
      const fromSystem = path.resolve(__dirname, '.stan', 'system');
      const candidates = [
        {
          src: path.join(fromSystem, 'stan.system.md'),
          dest: path.join(dest, 'stan.system.md'),
        },
      ];
      try {        await fs.ensureDir(dest);
        for (const c of candidates) {
          if (await fs.pathExists(c.src)) await fs.copyFile(c.src, c.dest);
        }
      } catch {
        // best-effort
      }
    },
  };
};
const makePlugins = (minify: boolean, extras: Plugin[] = []): Plugin[] => {
  const base: Plugin[] = [
    alias,
    nodeResolve({ exportConditions: ['node', 'module', 'default'] }),
    commonjsPlugin(),
    jsonPlugin(),
    typescriptPlugin(),
    ...extras,
  ];
  return minify
    ? [...base, terserPlugin({ format: { comments: false } })]
    : base;
};

const commonInputOptions = (
  minify: boolean,
  extras: Plugin[] = [],
): InputOptions => ({
  plugins: makePlugins(minify, extras),
  onwarn(warning, defaultHandler) {
    defaultHandler(warning);
  },
  external: (id) =>
    nodeExternals.has(id) ||
    externalPkgs.has(id) ||
    // also treat deep subpath imports as external (e.g., clipboardy/fallbacks/...)
    Array.from(externalPkgs).some((p) => id === p || id.startsWith(`${p}/`)),
});

const outCommon = (dest: string): OutputOptions[] => [
  { dir: `${dest}/mjs`, format: 'esm', sourcemap: false },
  { dir: `${dest}/cjs`, format: 'cjs', sourcemap: false },
];

export const buildLibrary = (dest: string): RollupOptions => ({
  input: 'src/index.ts',
  output: outCommon(dest),
  ...commonInputOptions(
    true,
    // Copy docs once from library config
    [copyDocsPlugin(dest)],
  ),
});

const discoverCliEntries = (): string[] => {
  const candidates = [
    'src/cli/bin/stan.ts',     // preferred: single bootstrap
    'src/cli/stan.ts',    // legacy fallback (should not exist post‑cleanup)
    'src/cli/index.ts',   // last resort (library factory only)
  ];
  const found = candidates.filter((p) => fs.existsSync(p));
  // Prefer a single CLI entry to avoid duplicate bundles.
  return found.length ? [found[0]!] : [];
};

export const buildCli = (dest: string): RollupOptions => ({
  input: discoverCliEntries(),
  output: [
    {
      dir: `${dest}/cli`,
      format: 'esm',
      sourcemap: false,
      banner: '#!/usr/bin/env node',
    },
  ],
  ...commonInputOptions(false),
});

export const buildTypes = (dest: string): RollupOptions => ({
  input: 'src/index.ts',
  output: [{ dir: `${dest}/types`, format: 'esm' }],
  // Ensure alias resolution works during type bundling to avoid unresolved "@/..." warnings.
  plugins: [alias, dtsPlugin()],
});

export default [
  buildLibrary(outputPath),
  buildCli(outputPath),  buildTypes(outputPath),
];
