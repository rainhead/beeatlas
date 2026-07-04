/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN: string;
  readonly VITE_DATA_BASE_URL?: string;
  readonly VITE_NOTES_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Compile-time build identifier injected by Vite `define` (eleventy.config.js).
// Undefined under Vitest (no define) — read it through a `typeof` guard.
declare const __APP_VERSION__: string;
