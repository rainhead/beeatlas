import { defineConfig } from 'vite';
import preloadAssets from './vite-plugin-preload.ts';

export default defineConfig({
  plugins: [preloadAssets()],
  optimizeDeps: {
    exclude: ['wa-sqlite'],
  },
  // NOTE: do NOT set `publicDir: false`. The eleventy-plugin-vite
  // build pipeline relies on Vite's default publicDir behavior to
  // copy passthrough assets (placed under `<.11ty-vite>/public/` by
  // Eleventy) into the final `_site/` root. Disabling publicDir here
  // would silently drop /data, /feeds, /db at runtime.
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
    passWithNoTests: true,
    // Exclude stale agent worktrees and Eleventy build output from test discovery.
    // (.claire/worktrees/ holds snapshots from prior agent runs; _site/ is build output.)
    exclude: ['**/node_modules/**', '**/.claire/**', '**/_site/**', '**/dist/**'],
  },
});
