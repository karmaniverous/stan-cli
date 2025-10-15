/** Library entry point.
 * See <stanPath>/system/stan.project.md for global and cross‑cutting requirements.
 */
export * from './runner/help';
export * from './runner/run';
// Consolidated type re‑exports for documentation completeness.
export type { ScriptEntry, ScriptMap } from './cli/config/schema';
