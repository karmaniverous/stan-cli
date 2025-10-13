/** Library entry point.
 * See <stanPath>/system/stan.project.md for global and cross‑cutting requirements.
 */
export * from './stan';
// Re‑export for documentation completeness (Typedoc warning fix).
export type { ScriptMap } from './cli/config/schema';
