/* src/runner/util/debug-scopes.ts
 * Centralized labels for debugFallback and legacy notices.
 * Keeping these in one place ensures logs and tests remain consistent.
 */

/** run action path (engine legacy extraction notice) */
export const DBG_SCOPE_RUN_ENGINE_LEGACY = 'run.action:engine-legacy';

/** cli config loader (legacy top-level CLI keys acceptance) */
export const DBG_SCOPE_CLI_CONFIG_LOAD = 'cli.config:load';

/** cli config loader (sync variant) */
export const DBG_SCOPE_CLI_CONFIG_LOAD_SYNC = 'cli.config:loadSync';

/** effective engine config resolver (namespaced vs legacy) */
export const DBG_SCOPE_EFFECTIVE_ENGINE_LEGACY =
  'config.effective:engine-legacy';

/** effective config resolver (stanPath fallback when config missing/invalid) */
export const DBG_SCOPE_EFFECTIVE_STANPATH_FALLBACK =
  'config.effective:stanpath-fallback';

/** snap context (legacy engine extraction notice) */
export const DBG_SCOPE_SNAP_CONTEXT_LEGACY = 'snap.context:legacy';

// Note:
// Add new scope tokens here and adopt them across the codebase
// to keep debugFallback(...) calls uniform and easy to grep.
// Tests should reference these exact tokens in expectations.
