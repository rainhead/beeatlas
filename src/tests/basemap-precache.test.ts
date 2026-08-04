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
// files (webmanifest + icons, under /pwa/) since ADR 0029.
//
// What it CANNOT check is whether the server returns those paths, and that is a real
// gap rather than a theoretical one: `/icons/` globbed and precached perfectly and
// 404'd in production, because Ubuntu's Apache aliases it (see the reserved-prefix
// test below). scripts/offline-uat.mjs closes that half against a running server.
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
  'index.html',
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
  'sw.js',
  // The READING SURFACE (ADR 0029). Sharing an origin with the app is not sharing
  // its offline story: these must stay out, or `index.html` has quietly become
  // `**/index.html` and the precache has grown by 101 MB of pages whose photos are
  // cross-origin and whose note writes depend on a live reload.
  'species/Bombus/mixtus/index.html',
  'places/klickitat-trail/index.html',
  'collectors/somebody/index.html',
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
  // …and the bundled MapLibre worker to _site/basemap/maplibre/ — inside the
  // service worker's scope, which is what makes it reachable offline.
  touch('basemap/maplibre/maplibre-gl-worker.mjs');
  // The PWA shell files the BROWSER requests (linked from index.html). Under /pwa/
  // because Ubuntu Apache aliases /icons/ over the document root — see eleventy.config.js.
  touch('pwa/manifest.webmanifest');
  for (const i of ['apple-touch-icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png'])
    touch(`pwa/icons/${i}`);
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
    expect(matched).toContain('basemap/maplibre/maplibre-gl-worker.mjs');
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
    expect(matched).toContain('index.html');
    expect(matched).toContain('assets/wa-sqlite-def456.wasm');
    expect(matched).toContain('assets/app/index-abc123.js');
    expect(matched).toContain('assets/app/index-abc123.css');
  });

  test('the reading surface is NOT precached', () => {
    // ADR 0029's line: offline is for the field, online is for the desk. The
    // failure mode this guards is a one-character edit — `index.html` growing a
    // globstar — which would silently pull 801 species pages, 180 place pages and
    // 124 collector pages into the SW install. That is 101 MB, whose photos are
    // cross-origin opaque responses (padded for quota, broken when 404) and whose
    // note writes depend on `window.location.reload()` reaching the network.
    for (const rel of [
      'species/Bombus/mixtus/index.html',
      'places/klickitat-trail/index.html',
      'collectors/somebody/index.html',
    ]) {
      expect(matched, `the read path must stay online-only: ${rel}`).not.toContain(rel);
    }
  });

  test('the MapLibre worker is served from inside the service worker scope', () => {
    // THE ONE THAT ACTUALLY SHIPPED BROKEN, so it is worth being precise about.
    //
    // A page the SW CONTROLS has its requests intercepted at any path, so a
    // main-thread fetch of /basemap/fonts/… is served from the precache. But a
    // DEDICATED WORKER is its own service-worker client, and whether its script load
    // and its own imports are intercepted is matched on the WORKER's URL — not on the
    // page that spawned it.
    //
    // Under the old /app/ scope the worker shipped at /basemap/maplibre/, outside it,
    // so neither its script nor its `./maplibre-gl-shared.mjs` import ever reached
    // the cache: offline both went to the network and failed, the map never fired
    // `load`, and the two precached files sat there unreachable. Every test passed.
    // The build was clean. The console was clean. (Same scope problem as the one
    // that makes the SQLite engine run from an inline blob: worker — src/manifest.ts.)
    //
    // Caught by scripts/offline-uat.mjs, which is the only thing that could.
    //
    // So the assertion is containment, checked against the scope the app ACTUALLY
    // registers rather than a path spelled here — under ADR 0029 that is the origin,
    // and if it is ever narrowed again this fails instead of the field.
    const registration = readFileSync(resolve(ROOT, 'src/sw-registration.ts'), 'utf8');
    const scope = registration.match(/const SW_SCOPE = '([^']+)'/)?.[1];
    expect(scope, 'src/sw-registration.ts must declare SW_SCOPE as a plain literal').toBeDefined();

    for (const p of globPatterns.filter((g) => g.includes('maplibre'))) {
      expect(`/${p}`, `the MapLibre worker must be precached from inside the SW scope ${scope}`)
        .toMatch(new RegExp(`^${scope}`));
    }
    const src = readFileSync(resolve(ROOT, 'src/bee-map.ts'), 'utf8');
    const workerUrl = src.match(/const MAPLIBRE_WORKER_URL = '([^']+)'/)?.[1];
    expect(workerUrl, 'src/bee-map.ts must declare MAPLIBRE_WORKER_URL as a plain literal').toBeDefined();
    expect(workerUrl!.startsWith(scope!),
      `setWorkerUrl points at ${workerUrl}, outside the SW scope ${scope} — offline the worker cannot be served`,
    ).toBe(true);
    // The URL bee-map hands MapLibre and the file the build precaches must be the
    // same file. Precaching a path nobody requests is the exact shape of the bug.
    expect(matched, 'bee-map asks for a worker the precache does not ship')
      .toContain(workerUrl!.replace(/^\//, ''));
  });

  test('glyphs are fetched from the main thread, where the SW can serve them', () => {
    // The main thread IS controlled, so a glyph fetch from it is served from the
    // precache wherever the file lives — which is why the fonts and sprites never
    // had to satisfy the scope constraint above, and the worker did.
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
    // Nothing in the app fetches these; index.html LINKS them and the browser
    // requests them when it launches a standalone PWA. Unprecached they fail
    // offline, and iOS answers each failure with a system network alert over a
    // map that is otherwise working. No fetch instrumentation can find them,
    // which is why they survived every other probe.
    expect(matched).toContain('pwa/manifest.webmanifest');
    expect(matched).toContain('pwa/icons/apple-touch-icon-180.png');
    // …plus the three the webmanifest itself names.
    for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      expect(matched, `webmanifest icon not precached: ${f}`).toContain(`pwa/icons/${f}`);
    }
  });

  test('nothing is precached from a path the server reserves', () => {
    // THE OTHER ONE THAT ACTUALLY SHIPPED BROKEN, and the more alarming of the two:
    // it takes the whole service worker down rather than one asset.
    //
    // `/icons/` was the obvious home for the PWA icons and is unreachable on this
    // server. Ubuntu's Apache ships `Alias /icons/ "/usr/share/apache2/icons/"` in
    // mods-enabled/alias.conf for mod_autoindex, and an Alias beats the document
    // root — so the files published correctly into htdocs and 404'd anyway.
    //
    // Because they are PRECACHED, that is not a missing icon. Every one 404s during
    // the SW's install, install fails, and with no older worker the registration is
    // DISCARDED: no service worker at all, no console error, nothing in the build
    // log, and every offline feature simply absent.
    //
    // Listed rather than derived because the authority is the server's config, which
    // is not in this repo. Add to it whenever a deploy turns up another.
    const SERVER_RESERVED = ['icons/'];   // Ubuntu Apache, mod_autoindex
    for (const prefix of SERVER_RESERVED) {
      for (const p of matched) {
        expect(p, `precached under a path the server aliases away: /${p}`)
          .not.toMatch(new RegExp(`^${prefix}`));
      }
    }
  });

  test('the webmanifest names URLs that exist, and a scope the app registers', () => {
    // ADR 0029 moved start_url and scope from /app/ to /. A webmanifest whose
    // start_url no longer resolves is not an error anyone sees at build time: an
    // installed PWA simply launches on a 404, and only on the device.
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'public/pwa/manifest.webmanifest'), 'utf8'));
    const registration = readFileSync(resolve(ROOT, 'src/sw-registration.ts'), 'utf8');
    const scope = registration.match(/const SW_SCOPE = '([^']+)'/)?.[1];

    // A launch outside the SW scope is an uncontrolled page: nothing precached is
    // reachable and the app cannot start offline at all.
    expect(manifest.scope, 'webmanifest scope must match the registered SW scope').toBe(scope);
    expect(manifest.start_url.startsWith(scope!),
      `start_url ${manifest.start_url} launches outside the SW scope ${scope}`).toBe(true);
    for (const icon of manifest.icons as Array<{ src: string }>) {
      expect(matched, `webmanifest names an unprecached icon: ${icon.src}`)
        .toContain(icon.src.replace(/^\//, ''));
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
      'sw.js',
    ]) {
      expect(matched, `should not be precached: ${rel}`).not.toContain(rel);
    }
  });
});
