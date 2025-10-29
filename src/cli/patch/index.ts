// src/cli/patch/index.ts
// Barrel re-export to preserve import stability for "./patch".
// Default export is an object containing the register function to be
// SSR/mocks friendly when spread (asEsmModule(...default)) so that
// { ...default } exposes a "registerPatch" property in test doubles.
import { registerPatch } from './register';

// Keep named export for normal call sites.
export { registerPatch } from './register';

// Provide an object default so spreading default in tests yields { registerPatch }.
export default { registerPatch };
