/// <reference types="vite/client" />

interface ImportMetaEnv {
  // No VITE_MAPBOX_TOKEN: the basemap is self-hosted (beeatlas-q73) and no
  // renderer asset is behind a key any more.
  readonly VITE_DATA_BASE_URL?: string;
  readonly VITE_NOTES_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

