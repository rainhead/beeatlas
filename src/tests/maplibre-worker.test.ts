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

  test('Eleventy copies the worker to that exact path', () => {
    const config = read('eleventy.config.js');
    expect(config).toContain('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
    // The passthrough target is written without the leading slash; the URL has it.
    expect(config).toContain(WORKER_URL.replace(/^\//, ''));
  });

  test('the worker ships with the shared chunk it imports, as a sibling', () => {
    // maplibre-gl-worker.mjs does `from "./maplibre-gl-shared.mjs"`. Copying the
    // worker alone reproduces the same 404 one level down, and just as quietly.
    const worker = read('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
    const relativeImports = [...worker.matchAll(/from\s*["'](\.[^"']+)["']/g)]
      .map(m => m[1])
      .filter((s): s is string => !!s);
    expect(relativeImports.length).toBeGreaterThan(0);

    const config = read('eleventy.config.js');
    for (const spec of new Set(relativeImports)) {
      const name = spec.replace(/^\.\//, '');
      expect(existsSync(resolve(ROOT, 'node_modules/maplibre-gl/dist', name)), `${name} missing from dist`).toBe(true);
      expect(config, `${name} is imported by the worker but never copied`)
        .toContain(`app/basemap/maplibre/${name}`);
    }
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
