// Service-worker build — a SECOND, tiny Vite pass that runs AFTER Eleventy.
//
// Why it is separate (beeatlas-d3y): vite-plugin-pwa's injectManifest globs the
// built site to compute the precache list, and that list includes `app/index.html`,
// which Eleventy writes. Under the old eleventy-plugin-vite the whole Vite build ran
// after Eleventy, so one pass sufficed. With backend integration the app build must
// run BEFORE Eleventy (Eleventy needs the manifest to emit hashed URLs), so the SW
// step is split off and ordered last.
//
// Everything the plugin touches is addressed absolutely (outDir, globDirectory,
// swDest), so the main build's own input and output are irrelevant here. Rather than
// add a stub module to the repo, this pass compiles one small existing module into a
// throwaway cache directory; only the plugin's SW output is kept.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: resolve(process.cwd(), 'node_modules/.cache/beeatlas-sw-pass'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(process.cwd(), 'src/lib/quantify.js') },
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',     // .ts extension triggers the TypeScript SW sub-build
      outDir: resolve(process.cwd(), '_site/app'),
      base: '/',             // ensures precache URLs have a leading /
      injectRegister: null,  // D-06: keep Phase 147 registration; no competing <script>
      manifest: false,       // D-07: no webmanifest emitted by the plugin
      injectManifest: {
        globDirectory: resolve(process.cwd(), '_site'),
        swDest: resolve(process.cwd(), '_site/app/sw.js'),
        // `.wasm` is load-bearing for offline cold-start: the wa-sqlite engine binary
        // (assets/wa-sqlite-<hash>.wasm) must be precached or the SQL worker can't
        // initialize offline → tablesReady never resolves → the "Loading…" curtain
        // hangs forever (Phase 151 real-device UAT, PWA-03).
        globPatterns: ['app/index.html', 'assets/**/*.{js,css,wasm}'],
        globIgnores: [
          'data/**', 'feeds/**', '**/*.db', '**/*.geojson',
          '**/*.parquet', '**/*.png', '**/sw.js',
        ],
        maximumFileSizeToCacheInBytes: 30_000_000,  // D-03: 30 MB cap
        // Glob paths are relative to globDirectory (_site/) without a leading /.
        // modifyURLPrefix prepends / so precache URLs are absolute site paths
        // (e.g. /app/index.html, /assets/app/index-<hash>.js) as required by the
        // criterion-4 assertion and the SW precache cache-key contract.
        modifyURLPrefix: { '': '/' },
      },
    }),
  ],
});
