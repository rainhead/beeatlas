// beeatlas-6rs. The service worker's precache list is the difference between an
// offline map and a blank rectangle, and every way it can be wrong is silent:
//
//   - no MapLibre worker  → tiles sit in `loading`, `load` never fires, blank map,
//                           clean console (see maplibre-worker.test.ts);
//   - a missing glyph range → blank boxes where the labels were, no error, and only
//                           for the codepoints that range covers — so a range nobody
//                           exercised online is a bug nobody sees until the field;
//   - a missing sprite    → MapLibre fails the whole style load.
//
// None of that is reachable from a unit test, and none of it shows up in a build
// log. What IS checkable is whether the glob patterns cover the files, so that is
// what this pins — using workbox's OWN globber (`glob`, via
// workbox-build/lib/get-file-details) against the real patterns from
// scripts/sw-precache-globs.ts, so this cannot drift from what ships.
//
// It runs off a synthesized _site layout rather than a real one: `npm test` must
// not require a completed build, and the layout is derivable — Eleventy copies
// public/basemap verbatim, plus the bundled MapLibre worker and the PWA shell
// files (webmanifest + icons) under app/.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { globSync } from 'glob';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globPatterns, globIgnores } from '../../scripts/sw-precache-globs.ts';
import { VENDORED_FONTSTACKS, VENDORED_GLYPH_RANGES } from '../basemap-style.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Every file under a directory, as paths relative to it, with `/` separators. */
function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
}

/**
 * Files that exist in _site but not in public/ or node_modules — the build's own
 * output, plus decoys that must stay OUT of the precache. Sizes are irrelevant;
 * globbing is by name.
 */
const SYNTHETIC = [
  'app/index.html',
  'assets/app/index-abc123.js',
  'assets/app/index-abc123.css',
  'assets/wa-sqlite-def456.wasm',
  // Decoys. Each is something the app fetches at runtime and must NOT be baked
  // into the SW install — the 33 MB database above all, which is primed with byte
  // progress by src/prime-orchestrator.ts instead.
  'data/occurrences-abc.db',
  'data/counties-abc.geojson',
  'data/occurrences-abc.parquet',
  'feeds/notes.json',
  'app/sw.js',
];


let siteDir: string;
let matched: Set<string>;

beforeAll(() => {
  siteDir = mkdtempSync(join(tmpdir(), 'beeatlas-precache-'));

  const touch = (rel: string) => {
    const full = join(siteDir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, '');
  };

  // Eleventy copies public/basemap verbatim to _site/basemap (eleventy.config.js).
  for (const rel of walk(resolve(ROOT, 'public/basemap'))) touch(`basemap/${rel}`);
  // …and the bundled MapLibre worker to _site/app/basemap/maplibre/ — inside the
  // service worker's /app/ scope, which is what makes it reachable offline.
  touch('app/basemap/maplibre/maplibre-gl-worker.mjs');
  // The PWA shell files the BROWSER requests (linked from app/index.html).
  touch('app/manifest.webmanifest');
  for (const i of ['apple-touch-icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png'])
    touch(`app/icons/${i}`);
  for (const rel of SYNTHETIC) touch(rel);

  // The exact call workbox-build makes, per pattern, with the ignores applied.
  matched = new Set(
    globPatterns.flatMap((pattern) =>
      globSync(pattern, { cwd: siteDir, ignore: globIgnores }),
    ),
  );
});

afterAll(() => {
  if (siteDir) rmSync(siteDir, { recursive: true, force: true });
});

describe('the service worker precaches everything the basemap needs to draw', () => {
  test('the MapLibre worker, as ONE self-contained file', () => {
    // It used to ship as two files, the worker importing its sibling at startup.
    // That import is made by the WORKER, which is not a controlled client, so
    // offline it went to the network and the worker died before running a line —
    // see the scope test below and scripts/build-maplibre-worker.mjs. The build
    // now bundles it; there is no sibling left to precache.
    expect(matched).toContain('app/basemap/maplibre/maplibre-gl-worker.mjs');
    expect([...matched].filter((p) => p.includes('maplibre'))).toHaveLength(1);
  });

  test('every vendored fontstack x every vendored range', () => {
    // Derived from the style's own allowlist, not from a hand-copied list: adding
    // a stack to VENDORED_FONTSTACKS makes this fail until the file is shipped,
    // rather than shipping blank boxes for whatever codepoints it covers.
    for (const stack of VENDORED_FONTSTACKS) {
      for (const range of VENDORED_GLYPH_RANGES) {
        expect(matched, `glyph range not precached: ${stack}/${range}.pbf`)
          .toContain(`basemap/fonts/${stack}/${range}.pbf`);
      }
    }
  });

  test('no glyph file on disk is left unprecached', () => {
    // The reverse direction. A stack present in public/basemap/fonts but outside
    // the allowlist is caught by basemap-style.test.ts; this catches a RANGE the
    // pattern happens not to reach — a `.pbf` under a path shape the glob misses.
    for (const rel of walk(resolve(ROOT, 'public/basemap/fonts'))) {
      expect(matched, `unprecached glyph file: ${rel}`).toContain(`basemap/fonts/${rel}`);
    }
  });

  test('both sprite densities, index and sheet alike', () => {
    // The .png half is the one that was actually broken: a blanket '**/*.png'
    // ignore covered it, and globIgnores beats globPatterns, so adding the sprite
    // pattern without narrowing the ignore would have changed nothing.
    for (const f of ['light.json', 'light.png', 'light@2x.json', 'light@2x.png']) {
      expect(matched, `sprite not precached: ${f}`).toContain(`basemap/sprites/${f}`);
    }
  });

  test('the app shell and the SQLite wasm are still precached', () => {
    // Regression guard on the pre-existing entries, which the beeatlas-6rs edit
    // moved out of vite.sw.config.ts into a shared module.
    expect(matched).toContain('app/index.html');
    expect(matched).toContain('assets/wa-sqlite-def456.wasm');
    expect(matched).toContain('assets/app/index-abc123.js');
    expect(matched).toContain('assets/app/index-abc123.css');
  });

  test('the MapLibre worker is served from inside the service worker scope', () => {
    // THE ONE THAT ACTUALLY SHIPPED BROKEN, so it is worth being precise about.
    //
    // The SW is registered with scope /app/. A page it CONTROLS has its requests
    // intercepted at any path, so a main-thread fetch of /basemap/fonts/… is
    // served from the precache. But a DEDICATED WORKER is its own service-worker
    // client, and whether its script load and its own imports are intercepted is
    // matched on the WORKER's URL — not on the page that spawned it.
    //
    // Shipped at /basemap/maplibre/, the worker was outside the scope, so neither
    // its script nor its `./maplibre-gl-shared.mjs` import ever reached the cache:
    // offline both went to the network and failed, the map never fired `load`, and
    // the two precached files sat there unreachable. Every test passed. The build
    // was clean. The console was clean. (This is the same scope problem that makes
    // the SQLite engine run from an inline blob: worker — see src/manifest.ts.)
    //
    // Caught by scripts/offline-uat.mjs, which is the only thing that could.
    for (const p of globPatterns.filter((g) => g.includes('maplibre'))) {
      expect(p, 'the MapLibre worker must be precached from inside the /app/ SW scope')
        .toMatch(/^app\//);
    }
    const src = readFileSync(resolve(ROOT, 'src/bee-map.ts'), 'utf8');
    expect(src, 'setWorkerUrl must point inside /app/, or the worker cannot be served offline')
      .toContain("'/app/basemap/maplibre/maplibre-gl-worker.mjs'");
  });

  test('glyphs are fetched from the main thread, where the SW can serve them', () => {
    // The main thread IS controlled, so a glyph fetch from it is served from the
    // precache wherever the file lives — which is why the fonts and sprites can
    // stay outside /app/ while the worker cannot.
    //
    // In MapLibre v6 the glyph URL template is expanded on the main thread. If an
    // upgrade ever moves that into the worker, those fetches become the worker's
    // own and stop being served — labels silently become blank boxes offline — so
    // it is caught HERE, structurally, rather than in a forest.
    const substitutesFontstack = (f: string) =>
      /replace\(.\{fontstack\}./.test(readFileSync(
        resolve(ROOT, 'node_modules/maplibre-gl/dist', f), 'utf8'));

    expect(substitutesFontstack('maplibre-gl.mjs'), 'main bundle no longer expands {fontstack}; find where it moved').toBe(true);
    expect(substitutesFontstack('maplibre-gl-worker.mjs'), 'glyph loading moved into the worker — it is outside SW scope and will fail offline').toBe(false);
    expect(substitutesFontstack('maplibre-gl-shared.mjs'), 'glyph loading moved into the shared chunk — check whether the worker now fetches glyphs').toBe(false);
  });

  test('the webmanifest and icons are precached — the browser requests them', () => {
    // Nothing in the app fetches these; app/index.html LINKS them and the browser
    // requests them when it launches a standalone PWA. Unprecached they fail
    // offline, and iOS answers each failure with a system network alert over a
    // map that is otherwise working. No fetch instrumentation can find them,
    // which is why they survived every other probe.
    expect(matched).toContain('app/manifest.webmanifest');
    expect(matched).toContain('app/icons/apple-touch-icon-180.png');
    // …plus the three the webmanifest itself names.
    for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      expect(matched, `webmanifest icon not precached: ${f}`).toContain(`app/icons/${f}`);
    }
  });

  test('runtime data artifacts and the SW itself stay out', () => {
    // The database above all: precached, it becomes a silent 33 MB download
    // during SW install with no progress UI.
    for (const rel of [
      'data/occurrences-abc.db',
      'data/counties-abc.geojson',
      'data/occurrences-abc.parquet',
      'feeds/notes.json',
      'app/sw.js',
    ]) {
      expect(matched, `should not be precached: ${rel}`).not.toContain(rel);
    }
  });
});
