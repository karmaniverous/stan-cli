/** ESM-friendly mock helper for Vitest.
 * Usage:
 * vi.mock('module', () =\>
 *   asEsmModule(\{
 *     namedExport: () =\> 'ok',
 *   \}),
 * );
 */
export const asEsmModule = <T extends Record<string, unknown>>(impl: T) => ({
  __esModule: true as const,
  default: impl,
  ...impl,
});
