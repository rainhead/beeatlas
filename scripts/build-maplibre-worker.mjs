#!/usr/bin/env node
/**
 * Bundle MapLibre's worker into ONE self-contained file (beeatlas-6rs).
 *
 * THE BUG THIS FIXES. `maplibre-gl-worker.mjs` opens with
 * `from "./maplibre-gl-shared.mjs"` — a module import made BY THE WORKER at
 * startup. A dedicated worker is its own service-worker client and is not
 * controlled by the /app/ registration, so that import is never served from the
 * precache: offline it goes to the network, fails, and the worker dies before it
 * runs a line.
 *
 * Everything downstream then stops without a word. Vector tile parsing, GeoJSON
 * clustering and symbol layout all live on that worker, so the basemap sources
 * stall at loaded=false AND the purely-local occurrence layer draws none of its
 * 101,516 features — no error, no console output, just a blank map. With a pool
 * of workers where only some die, you get tile-shaped holes that move as you
 * zoom, which is how this was first reported.
 *
 * Measured, not assumed: a worker under /app/ importing its sibling returns
 * SIBLING-IMPORT-OK online and fails with an opaque error offline, in BOTH
 * WebKit and Chromium, with the server killed rather than emulated.
 *
 * Copying the two dist files side by side (the previous approach) cannot work,
 * however correct the precache looks — and it looked correct: both files were
 * precached, and a page-side fetch of either returned 200. Only the worker
 * cannot read them.
 *
 * So the import is removed at build time instead. Output goes to a gitignored
 * staging dir that Eleventy passthrough-copies, so dev and prod get the file the
 * same way and neither depends on the other's ordering.
 */
import { build } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENTRY = resolve('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
const OUT_DIR = resolve('.cache/beeatlas-maplibre');
const OUT_FILE = resolve(OUT_DIR, 'maplibre-gl-worker.mjs');

if (!existsSync(ENTRY)) {
  console.error(`build-maplibre-worker: ${ENTRY} missing — is maplibre-gl installed?`);
  process.exit(1);
}

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    lib: {
      entry: ENTRY,
      formats: ['es'],
      fileName: () => 'maplibre-gl-worker.mjs',
    },
    rollupOptions: {
      // One file or nothing: a split chunk would reintroduce exactly the runtime
      // import this exists to remove.
      output: { inlineDynamicImports: true },
    },
  },
});

// Verify rather than trust. The failure this guards against is silent at every
// other layer, so a leftover relative import must stop the build here.
const out = readFileSync(OUT_FILE, 'utf8');
const relativeImports = [...out.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)].map((m) => m[1]);
if (relativeImports.length > 0) {
  console.error(
    'build-maplibre-worker: the bundle still imports siblings at runtime — ' +
    'a worker cannot fetch these offline:', relativeImports,
  );
  process.exit(1);
}

console.log(`build-maplibre-worker: ${(out.length / 1024).toFixed(0)} KB, self-contained`);
