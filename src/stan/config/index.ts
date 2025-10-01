/* src/stan/config/index.ts
 * Public API barrel for STAN config modules.
 */
export { DEFAULT_OPEN_COMMAND, DEFAULT_STAN_PATH } from './defaults';
export { findConfigPathSync } from './discover';
export {
  loadConfig,
  loadConfigSync,
  resolveStanPath,
  resolveStanPathSync,
} from './load';
export { ensureOutputDir } from './output';
export type {
  CliDefaults,
  CliDefaultsPatch,
  CliDefaultsRun,
  CliDefaultsSnap,
  ContextConfig,
  ScriptEntry,
  ScriptMap,
} from './types';
