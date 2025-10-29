// src/cli/patch/index.ts
// Barrel re-export to preserve import stability for "./patch".
// Default export is the callable register function (SSR/mocks friendly).
export { registerPatch as default, registerPatch } from './register';
