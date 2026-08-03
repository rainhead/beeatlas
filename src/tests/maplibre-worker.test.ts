// beeatlas-q73. MapLibre runs tile fetching, decoding and symbol layout on a
// worker, and locates that worker by deriving a sibling URL from its own
// `import.meta.url` — which is only correct while the library is served as its
// untouched dist files. Bundled, it asks for a worker next to OUR chunk.
//
// Everything about that failure is invisible:
//   - no console error; the 404 is swallowed inside MapLibre;
//   - no failed assertion; every unit test here mocks maplibre-gl;
//   - smoke-boot passes; the components upgrade and #map resolves;
//   - the map is a blank rectangle, because tiles sit in `loading` forever, so
//     `style.loaded()` stays false, so the map's `load` event never fires — and
//     the occurrence sources and layers are added inside that handler.
//
// A screenshot is the only thing that catches it, which is exactly why this file
// exists. It pins the three moving parts that have to agree: the URL bee-map
// hands MapLibre, the passthrough that puts a file there, and the pair of dist
// files being real siblings.
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const WORKER_URL = '/app/basemap/maplibre/maplibre-gl-worker.mjs';

describe('the MapLibre worker is served, and from where bee-map says it is', () => {
  test('bee-map hands MapLibre an explicit worker URL', () => {
    const src = read('src/bee-map.ts');
    expect(src).toMatch(/setWorkerUrl\s*\(/);
    expect(src).toContain(WORKER_URL);
  });

  test('setWorkerUrl runs before any map is constructed', () => {
    // Ordering is the whole point: MapLibre reads config.WORKER_URL when it spins
    // up its worker pool, so a call made after `new Map(...)` is a no-op on the
    // pool that already exists — and fails in exactly the silent way above.
    const src = read('src/bee-map.ts');
    const configure = src.indexOf('configureRenderer()');
    const construct = src.indexOf('new maplibregl.Map(');
    expect(configure).toBeGreaterThan(-1);
    expect(construct).toBeGreaterThan(-1);
    expect(configure).toBeLessThan(construct);
  });

  test('the build puts a worker at that exact path', () => {
    const config = read('eleventy.config.js');
    // The passthrough target is written without the leading slash; the URL has it.
    expect(config).toContain(WORKER_URL.replace(/^\//, ''));
    // …sourced from the BUNDLED staging dir, not from node_modules directly.
    expect(config).toContain('.cache/beeatlas-maplibre/maplibre-gl-worker.mjs');
  });

  test('the shipped worker imports NOTHING at runtime', () => {
    // THE ONE THAT SHIPPED BROKEN. maplibre-gl-worker.mjs as distributed opens
    // with `from "./maplibre-gl-shared.mjs"` — a fetch made BY THE WORKER at
    // startup. A dedicated worker is its own service-worker client and is not
    // controlled by the /app/ registration, so offline that import is never
    // served from the precache: it goes to the network, fails, and the worker
    // dies before running a line. Tile parsing, GeoJSON clustering and symbol
    // layout all stop, with no error anywhere.
    //
    // Shipping BOTH files side by side did not fix it and could not. It looked
    // fixed: the precache listed both, and a page-side fetch of either returned
    // 200 — but only the worker needs them and only the worker cannot read them.
    // Measured offline (server killed, not emulated) in WebKit AND Chromium.
    //
    // So the build bundles it into one self-contained file. If a relative import
    // ever comes back, offline dies silently again — hence this assertion.
    const upstream = read('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
    expect(upstream, 'upstream no longer splits the worker; re-check whether the bundling step is still needed')
      .toMatch(/from\s*["']\.\//);

    const bundled = resolve(ROOT, '.cache/beeatlas-maplibre/maplibre-gl-worker.mjs');
    if (!existsSync(bundled)) return; // not built yet; the build script asserts this too
    const out = readFileSync(bundled, 'utf8');
    expect([...out.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)].map(m => m[1]))
      .toEqual([]);
  });

  test('the worker is NOT bundled — it must stay a standalone file', () => {
    // An earlier attempt imported it through `?worker&url`. Vite emitted the
    // chunk but left it out of the manifest, so the bundle's own asset prune
    // deleted it — and MapLibre was pointed at a file that no longer existed.
    const src = read('src/bee-map.ts');
    // Importing it — by package path or through a Vite worker query — is what
    // pulls it into the bundle graph. Naming the served URL is fine.
    expect(src).not.toMatch(/from\s*['"][^'"]*maplibre-gl-worker/);
    expect(src).not.toMatch(/\?worker/);
  });
});
