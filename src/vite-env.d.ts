/// <reference types="vite/client" />

// Build-time stamp (see vite.config.ts `define`). Typed as `string` so the
// AdminPanel About section reads cleanly; the `define` replacement guarantees
// a real string at runtime ("dev" when unset).
interface ImportMetaEnv {
  readonly BUILD_ID: string;
}
